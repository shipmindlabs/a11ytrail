/**
 * Turning evidence into a conformance claim — including the claim nobody wants
 * to make, which is "we do not know yet".
 *
 * WCAG's own conformance requirement is unforgiving on purpose: a claim at a
 * level means every criterion at that level is satisfied. There is no partial
 * credit and no averaging. So an unevaluated criterion cannot be quietly
 * treated as a pass, and this module refuses to do it.
 */

import { AUTOMATABLE, criteriaFor, type Criterion, type Level } from "./criteria.ts";
import type { Check, Evidence } from "./evidence.ts";

export type CriterionStatus =
  | "satisfied"
  | "failed"
  /** Passes somewhere, fails or is unevaluated somewhere else. */
  | "partial"
  | "not-applicable"
  /** Nobody has looked. This is why a claim cannot be made. */
  | "not-evaluated"
  /** Looked at, undecided. */
  | "inconclusive";

export type CriterionResult = {
  readonly criterion: Criterion;
  readonly status: CriterionStatus;
  /** Scopes with no check for this criterion at all. */
  readonly unevaluatedScopes: readonly string[];
  /** Checks older than the staleness window. */
  readonly staleChecks: readonly Check[];
  /**
   * True when every check behind this status came from a scanner. Automated
   * tools settle roughly a quarter to a third of accessibility problems, so
   * this marks a pass that no person has confirmed.
   */
  readonly automatedOnly: boolean;
  /**
   * True when a scanner alone passed a criterion scanners cannot settle —
   * whether alt text is meaningful, whether focus order makes sense. This is
   * not weak evidence, it is absent evidence wearing a green tick.
   */
  readonly beyondAutomation: boolean;
};

export type ClaimStatus =
  | "conformant"
  | "partially-conformant"
  | "non-conformant"
  /** Evidence is missing; no claim can be made yet. */
  | "incomplete";

export type Claim = {
  readonly level: Level;
  readonly status: ClaimStatus;
  readonly results: readonly CriterionResult[];
  readonly failed: readonly CriterionResult[];
  readonly unevaluated: readonly CriterionResult[];
  readonly stale: readonly CriterionResult[];
  /** Satisfied only by scanners, with nobody having confirmed. */
  readonly unconfirmed: readonly CriterionResult[];
  /** Satisfied by a scanner for a criterion no scanner can settle. */
  readonly overclaimed: readonly CriterionResult[];
  /** Why the claim is what it is, in one sentence per reason. */
  readonly reasons: readonly string[];
};

export type AssessOptions = {
  readonly level?: Level;
  /** Scopes the claim covers. Defaults to every scope in the evidence. */
  readonly scopes?: readonly string[];
  /** Evidence older than this many days is stale. Defaults to 365. */
  readonly staleAfterDays?: number;
  /** The date the assessment is made. Injectable so reports are reproducible. */
  readonly asOf?: Date;
};

export function assess(evidence: Evidence, options: AssessOptions = {}): Claim {
  const level = options.level ?? "AA";
  const asOf = options.asOf ?? new Date();
  const staleAfterDays = options.staleAfterDays ?? 365;
  const scopes = options.scopes ?? evidence.scopes;

  const results = criteriaFor(level).map((criterion) =>
    assessCriterion(criterion, evidence, scopes, asOf, staleAfterDays),
  );

  const failed = results.filter((r) => r.status === "failed" || r.status === "partial");
  const unevaluated = results.filter(
    (r) => r.status === "not-evaluated" || r.status === "inconclusive",
  );
  const stale = results.filter((r) => r.staleChecks.length > 0);
  const unconfirmed = results.filter((r) => r.automatedOnly && r.status === "satisfied");
  const overclaimed = results.filter((r) => r.beyondAutomation && r.status === "satisfied");

  const reasons: string[] = [];
  let status: ClaimStatus;
  if (scopes.length === 0) {
    status = "incomplete";
    reasons.push("no evidence has been recorded");
  } else if (unevaluated.length > 0) {
    // The honest answer, and the one most reports skip.
    status = "incomplete";
    reasons.push(
      `${unevaluated.length} of ${results.length} criteria have no conclusive evidence, so conformance cannot be claimed`,
    );
  } else if (failed.length === 0) {
    status = "conformant";
  } else if (failed.length === results.length) {
    status = "non-conformant";
    reasons.push("no criterion is satisfied across the covered scopes");
  } else {
    status = "partially-conformant";
    reasons.push(`${failed.length} criteria are not satisfied across the covered scopes`);
  }

  if (stale.length > 0) {
    reasons.push(
      `${stale.length} criteria rest on evidence older than ${staleAfterDays} days`,
    );
  }
  if (unconfirmed.length > 0) {
    reasons.push(
      `${unconfirmed.length} criteria are satisfied by automated checks alone, which settle only part of WCAG`,
    );
  }

  if (overclaimed.length > 0) {
    reasons.push(
      `${overclaimed.length} criteria are passed by a scanner alone although no scanner can settle them`,
    );
  }

  return { level, status, results, failed, unevaluated, stale, unconfirmed, overclaimed, reasons };
}

function assessCriterion(
  criterion: Criterion,
  evidence: Evidence,
  scopes: readonly string[],
  asOf: Date,
  staleAfterDays: number,
): CriterionResult {
  const latest = evidence.latestPerScope(criterion.id).filter((c) => scopes.includes(c.scope));
  const covered = new Set(latest.map((check) => check.scope));
  const unevaluatedScopes = scopes.filter((scope) => !covered.has(scope));

  const staleBefore = asOf.getTime() - staleAfterDays * 24 * 60 * 60 * 1000;
  const staleChecks = latest.filter((check) => Date.parse(check.checkedAt) < staleBefore);

  const outcomes = new Set(latest.map((check) => check.outcome));
  const automatedOnly =
    latest.length > 0 && latest.every((check) => check.method === "automated");

  // The order matters. A failure anywhere outranks a pass everywhere else: a
  // criterion that fails on the checkout page is not satisfied because it holds
  // on the home page. But a gap in coverage is not a failure — it is a gap, and
  // reporting it as a failure would send someone to fix code that may be fine
  // while the actual answer is "nobody has looked at that page".
  let status: CriterionStatus;
  if (latest.length === 0) {
    status = "not-evaluated";
  } else if (outcomes.has("failed")) {
    status =
      outcomes.has("passed") || outcomes.has("not-applicable") || unevaluatedScopes.length > 0
        ? "partial"
        : "failed";
  } else if (outcomes.has("inconclusive")) {
    status = "inconclusive";
  } else if (unevaluatedScopes.length > 0) {
    status = "not-evaluated";
  } else if (outcomes.size === 1 && outcomes.has("not-applicable")) {
    status = "not-applicable";
  } else {
    status = "satisfied";
  }

  return {
    criterion,
    status,
    unevaluatedScopes,
    staleChecks,
    automatedOnly,
    beyondAutomation: automatedOnly && !AUTOMATABLE.has(criterion.id),
  };
}
