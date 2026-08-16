/**
 * The accessibility statement, which is the artefact a regulator actually asks
 * for.
 *
 * The European model statement has a fixed shape: a compliance status, the
 * non-accessible content and why, how the assessment was made, when it was
 * prepared, and how someone reports a problem and escalates it. Products get
 * audited and then publish nothing, or publish a page claiming full compliance
 * that the evidence does not support. This module builds the statement out of
 * the evidence, so the claim and the record cannot drift apart.
 */

import { type Claim, type ClaimStatus } from "./conformance.ts";

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
};

export type Statement = {
  readonly organisation: Organisation;
  readonly status: ComplianceStatus;
  readonly level: string;
  readonly preparedOn: string;
  /** Criteria that are not met, with the reason a reader needs. */
  readonly nonAccessibleContent: readonly string[];
  /** Everything qualifying the claim: gaps, stale evidence, unconfirmed passes. */
  readonly caveats: readonly string[];
};

export class UnsupportedClaim extends Error {}

/**
 * Build the statement from a claim.
 *
 * An incomplete claim throws. There is no honest way to render "we have not
 * finished looking" as one of the three statuses the model allows, and a
 * library that silently picked "partially compliant" would be helping someone
 * publish a claim they cannot defend.
 */
export function statement(claim: Claim, organisation: Organisation, preparedOn: Date): Statement {
  return {
    organisation,
    status: complianceStatus(claim.status),
    level: `WCAG 2.2 level ${claim.level}`,
    preparedOn: preparedOn.toISOString().slice(0, 10),
    nonAccessibleContent: claim.failed.map(
      (result) =>
        `${result.criterion.id} ${result.criterion.name} (level ${result.criterion.level})` +
        (result.unevaluatedScopes.length > 0
          ? ` — not satisfied where it was checked; ${result.unevaluatedScopes.length} scope(s) not checked at all`
          : ""),
    ),
    caveats: claim.reasons,
  };
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
  const lines = [
    `# Accessibility statement`,
    ``,
    `${s.organisation.name} is committed to making ${s.organisation.service} accessible, in accordance with the European Accessibility Act.`,
    ``,
    `## Compliance status`,
    ``,
    `${s.organisation.service} is **${s.status}** with ${s.level}.`,
    ``,
  ];

  if (s.nonAccessibleContent.length > 0) {
    lines.push(`## Non-accessible content`, ``);
    lines.push(`The content below is not accessible for the following reasons.`, ``);
    for (const item of s.nonAccessibleContent) lines.push(`- ${item}`);
    lines.push(``);
  }

  if (s.caveats.length > 0) {
    lines.push(`## Limits of this assessment`, ``);
    for (const caveat of s.caveats) lines.push(`- ${caveat}`);
    lines.push(``);
  }

  lines.push(
    `## Preparation of this statement`,
    ``,
    `This statement was prepared on ${s.preparedOn}.`,
    s.organisation.assessmentMethod
      ? `The assessment method was: ${s.organisation.assessmentMethod}.`
      : `The assessment was made by reviewing recorded evidence per success criterion.`,
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
