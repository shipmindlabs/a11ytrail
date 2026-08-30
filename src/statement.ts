/**
 * The accessibility statement, which is the artefact a regulator actually asks
 * for.
 *
 * The European model statement has a fixed shape: a compliance status, the
 * non-accessible content and why, how the assessment was made, when it was
 * prepared, and how someone reports a problem and escalates it. What follows
 * from the evidence is filled in here. What does not — whether an exemption is
 * a disproportionate burden, what alternative a user is offered, what a failing
 * criterion means for the person sitting in front of it — is left marked as a
 * decision somebody has to make. A plausible sentence in those places is worse
 * than an empty one, because it reads as answered.
 */

import type { Claim, ClaimStatus, CriterionResult } from "./conformance.ts";
import type { Level } from "./criteria.ts";

/** The three statuses the European model statement allows. */
export type ComplianceStatus = "fully compliant" | "partially compliant" | "non-compliant";

export type Organisation = {
  readonly name: string;
  /** What the statement covers: a site, an app, a service. */
  readonly service: string;
  /** Where a person reports an accessibility problem. */
  readonly feedbackContact: string;
  /** The national enforcement body a complaint escalates to. */
  readonly enforcementProcedure: string;
  /** How the assessment was made, e.g. "self-assessment" or who audited. */
  readonly assessmentMethod?: string;
  /** ISO date the statement was last reviewed. */
  readonly lastReviewedOn?: string;
  /**
   * Content exempted as a disproportionate burden, one entry per exemption. An
   * empty array says the question was considered and nothing is claimed;
   * leaving the field out says nobody has answered it yet.
   */
  readonly disproportionateBurden?: readonly string[];
  /** Content outside the scope of the legislation. Same empty-versus-absent rule. */
  readonly outOfScope?: readonly string[];
  /** The accessible alternative offered for a failure, keyed by criterion id. */
  readonly alternatives?: Readonly<Record<string, string>>;
};

/** Where in the statement a decision belongs. */
export type Section =
  | "non-accessible-content"
  | "disproportionate-burden"
  | "out-of-scope"
  | "preparation";

/** A part of the statement the evidence cannot settle. */
export type Pending = {
  readonly id: string;
  readonly section: Section;
  /** What a person has to decide. */
  readonly question: string;
  /** Why the record cannot answer it. */
  readonly because: string;
};

export type NonAccessibleItem = {
  readonly criterion: string;
  readonly name: string;
  readonly level: Level;
  /** Scopes where a check recorded a failure. */
  readonly failingScopes: readonly string[];
  /** Scopes with no check for this criterion at all. */
  readonly uncheckedScopes: readonly string[];
  /** What a person runs into, taken from the notes on the failing checks. */
  readonly reason?: string;
  /** How to reach the same content or service another way. */
  readonly alternative?: string;
};

export type Statement = {
  readonly organisation: Organisation;
  readonly status: ComplianceStatus;
  readonly level: string;
  readonly preparedOn: string;
  /** Criteria that are not met, with what the evidence says about each. */
  readonly nonAccessibleContent: readonly NonAccessibleItem[];
  /** Everything qualifying the claim: gaps, stale evidence, unconfirmed passes. */
  readonly caveats: readonly string[];
  /** Decisions the evidence cannot make. Empty when the statement is ready. */
  readonly pending: readonly Pending[];
};

export class UnsupportedClaim extends Error {}

const NEEDS_DECISION = "**[needs a human decision]**";

/**
 * Build the statement from a claim.
 *
 * An incomplete claim throws. There is no honest way to render "we have not
 * finished looking" as one of the three statuses the model allows, and a
 * library that silently picked "partially compliant" would be helping someone
 * publish a claim they cannot defend.
 */
export function statement(claim: Claim, organisation: Organisation, preparedOn: Date): Statement {
  const nonAccessibleContent = claim.failed.map((result) => describe(result, organisation));

  return {
    organisation,
    status: complianceStatus(claim.status),
    level: `WCAG 2.2 level ${claim.level}`,
    preparedOn: preparedOn.toISOString().slice(0, 10),
    nonAccessibleContent,
    caveats: claim.reasons,
    pending: [
      ...nonAccessibleContent.flatMap(pendingForItem),
      ...pendingForExemptions(organisation),
      ...pendingForPreparation(organisation),
    ],
  };
}

function describe(result: CriterionResult, organisation: Organisation): NonAccessibleItem {
  const failing = result.checks.filter((check) => check.outcome === "failed");
  const notes = [
    ...new Set(failing.flatMap((check) => (check.note?.trim() ? [check.note.trim()] : []))),
  ];

  return {
    criterion: result.criterion.id,
    name: result.criterion.name,
    level: result.criterion.level,
    failingScopes: failing.map((check) => check.scope),
    uncheckedScopes: result.unevaluatedScopes,
    reason: notes.length > 0 ? notes.join("; ") : undefined,
    alternative: organisation.alternatives?.[result.criterion.id],
  };
}

function pendingForItem(item: NonAccessibleItem): Pending[] {
  const label = `${item.criterion} ${item.name}`;
  const pending: Pending[] = [];

  if (item.reason === undefined) {
    pending.push({
      id: `reason:${item.criterion}`,
      section: "non-accessible-content",
      question: `Describe what a person runs into for ${label}.`,
      because:
        "the checks record that the criterion fails, and a criterion number is not a description of a barrier",
    });
  }

  if (item.alternative === undefined) {
    pending.push({
      id: `alternative:${item.criterion}`,
      section: "non-accessible-content",
      question: `Name the accessible alternative for ${label}, or say there is none.`,
      because: "the evidence records what fails, not what else is offered instead",
    });
  }

  return pending;
}

function pendingForExemptions(organisation: Organisation): Pending[] {
  const pending: Pending[] = [];

  if (organisation.disproportionateBurden === undefined) {
    pending.push({
      id: "disproportionate-burden",
      section: "disproportionate-burden",
      question: "State which content, if any, is exempt as a disproportionate burden.",
      because:
        "a burden weighs cost against benefit for this organisation, which no record of tests can do",
    });
  }

  if (organisation.outOfScope === undefined) {
    pending.push({
      id: "out-of-scope",
      section: "out-of-scope",
      question: "State which content, if any, falls outside the scope of the legislation.",
      because: "scope is a legal reading of the content, not a test result",
    });
  }

  return pending;
}

function pendingForPreparation(organisation: Organisation): Pending[] {
  const pending: Pending[] = [];

  if (!organisation.assessmentMethod?.trim()) {
    pending.push({
      id: "assessment-method",
      section: "preparation",
      question:
        "Say how the assessment was made: a self-assessment, or an evaluation by a named third party.",
      because:
        "the evidence names who ran each check, not whether the assessment as a whole was self-declared or independent",
    });
  }

  if (!organisation.lastReviewedOn?.trim()) {
    pending.push({
      id: "last-review",
      section: "preparation",
      question: "Give the date this statement was last reviewed.",
      because: "a review is an act by a person; the date of the last check is not the date of a review",
    });
  }

  return pending;
}

function complianceStatus(status: ClaimStatus): ComplianceStatus {
  switch (status) {
    case "conformant":
      return "fully compliant";
    case "partially-conformant":
      return "partially compliant";
    case "non-conformant":
      return "non-compliant";
    case "incomplete":
      throw new UnsupportedClaim(
        "the evidence does not support any compliance status yet: criteria remain unevaluated. " +
          "Finish the assessment, or publish a statement that says the assessment is under way.",
      );
  }
}

/** Render the statement as Markdown, in the order the model statement uses. */
export function toMarkdown(s: Statement): string {
  const lines: string[] = [
    `# Accessibility statement`,
    ``,
    `${s.organisation.name} is committed to making ${s.organisation.service} accessible, in accordance with the European Accessibility Act.`,
    ``,
  ];

  if (s.pending.length > 0) {
    lines.push(
      `> **Draft: ${s.pending.length} part(s) of this statement need a human decision.** They are marked ${NEEDS_DECISION} below and have to be answered before this is published.`,
      ``,
    );
  }

  lines.push(
    `## Compliance status`,
    ``,
    `${s.organisation.service} is **${s.status}** with ${s.level}.`,
    ``,
  );

  const nonAccessible = nonAccessibleSection(s);
  if (nonAccessible.length > 0) lines.push(`## Non-accessible content`, ``, ...nonAccessible);

  if (s.caveats.length > 0) {
    lines.push(`## Limits of this assessment`, ``);
    for (const caveat of s.caveats) lines.push(`- ${caveat}`);
    lines.push(``);
  }

  const method = s.organisation.assessmentMethod;
  const reviewed = s.organisation.lastReviewedOn;
  lines.push(
    `## Preparation of this statement`,
    ``,
    `This statement was prepared on ${s.preparedOn}.`,
    `Assessment method: ${method ? `${method}.` : mark(s, "assessment-method")}`,
    `Last reviewed on: ${reviewed ? `${reviewed}.` : mark(s, "last-review")}`,
    ``,
    `## Feedback and contact information`,
    ``,
    `Report an accessibility problem: ${s.organisation.feedbackContact}.`,
    ``,
    `## Enforcement procedure`,
    ``,
    s.organisation.enforcementProcedure,
    ``,
  );

  return lines.join("\n");
}

function nonAccessibleSection(s: Statement): string[] {
  const lines: string[] = [];

  if (s.nonAccessibleContent.length > 0) {
    lines.push(`### Non-compliance with the accessibility requirements`, ``);
    for (const item of s.nonAccessibleContent) {
      const where =
        item.failingScopes.length > 0 ? ` — fails on: ${item.failingScopes.join(", ")}` : "";
      lines.push(`- **${item.criterion} ${item.name}** (level ${item.level})${where}`);
      lines.push(`  - ${item.reason ?? mark(s, `reason:${item.criterion}`)}`);
      if (item.uncheckedScopes.length > 0) {
        lines.push(
          `  - Not checked at all on: ${item.uncheckedScopes.join(", ")} — unknown rather than working.`,
        );
      }
      lines.push(
        `  - Accessible alternative: ${item.alternative ?? mark(s, `alternative:${item.criterion}`)}`,
      );
    }
    lines.push(``);
  }

  lines.push(
    ...exemptions(
      `### Disproportionate burden`,
      s.organisation.disproportionateBurden,
      mark(s, "disproportionate-burden"),
    ),
    ...exemptions(
      `### Content outside the scope of the legislation`,
      s.organisation.outOfScope,
      mark(s, "out-of-scope"),
    ),
  );

  return lines;
}

function exemptions(
  heading: string,
  declared: readonly string[] | undefined,
  pending: string,
): string[] {
  if (declared === undefined) return [heading, ``, pending, ``];
  if (declared.length === 0) return [];
  return [heading, ``, ...declared.map((entry) => `- ${entry}`), ``];
}

function mark(s: Statement, id: string): string {
  const decision = s.pending.find((entry) => entry.id === id);
  return decision ? `${NEEDS_DECISION} ${decision.question} (${decision.because})` : "";
}
