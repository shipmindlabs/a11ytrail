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
  /** Fails somewhere, holds or is unchecked elsewhere: a failure with a limit. */
  | "partial"
  | "not-applicable"
  /** Nobody has looked, or nobody has looked everywhere. */
  | "not-evaluated"
  /** Looked at, undecided. */
  | "inconclusive";

/** Why a check no longer says anything about the build being assessed. */
export type StaleReason =
  /** Older than the staleness window. */
  | "aged-out"
  /** Recorded against a build that is not the one being assessed. */
  | "other-build"
  /** Records no build, so it cannot be tied to the one being assessed. */
  | "build-unknown";

export type StaleCheck = {
  readonly check: Check;
  readonly reason: StaleReason;
};

/** One check to re-run, named by what it covers. */
export type Recheck = {
  readonly criterion: Criterion;
  readonly scope: string;
  readonly reason: StaleReason;
  readonly lastCheckedAt: string;
  readonly lastBuild?: string;
};

export type CriterionResult = {
  readonly criterion: Criterion;
  readonly status: CriterionStatus;
  /**
   * The checks the status rests on: the most recent one per covered scope. A
   * claim that cannot show the evidence under it is the kind that collapses
   * when someone asks to see it.
   */
  readonly checks: readonly Check[];
  /** Scopes with no check for this criterion at all. */
  readonly unevaluatedScopes: readonly string[];
  /** Checks that aged out or belong to another build, with which of the two. */
  readonly staleChecks: readonly StaleCheck[];
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
  /** The build the claim is about, when one was named. */
  readonly build?: string;
  readonly results: readonly CriterionResult[];
  readonly failed: readonly CriterionResult[];
  readonly unevaluated: readonly CriterionResult[];
  readonly stale: readonly CriterionResult[];
  /** Every criterion and scope whose evidence no longer applies: the work list. */
  readonly recheck: readonly Recheck[];
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
  /**
   * The build the claim is about — a version, a tag, a commit. Given one, a
   * check recorded against another build, or against none, needs re-running:
   * a pass on the release before last says nothing about what ships today.
   */
  readonly build?: string;
  /** The date the assessment is made. Injectable so reports are reproducible. */
  readonly asOf?: Date;
};

export function assess(evidence: Evidence, options: AssessOptions = {}): Claim {
  const level = options.level ?? "AA";
  const asOf = options.asOf ?? new Date();
  const staleAfterDays = options.staleAfterDays ?? 365;
  const scopes = options.scopes ?? evidence.scopes;
  const build = options.build;

  const results = criteriaFor(level).map((criterion) =>
    assessCriterion(criterion, evidence, scopes, asOf, staleAfterDays, build),
  );

  const failed = results.filter((r) => r.status === "failed" || r.status === "partial");
  const unevaluated = results.filter(
    (r) => r.status === "not-evaluated" || r.status === "inconclusive",
  );
  const stale = results.filter((r) => r.staleChecks.length > 0);
  const recheck = results.flatMap((result) =>
    result.staleChecks.map((entry) => ({
      criterion: result.criterion,
      scope: entry.check.scope,
      reason: entry.reason,
      lastCheckedAt: entry.check.checkedAt,
      lastBuild: entry.check.build,
    })),
  );
  const unconfirmed = results.filter((r) => r.automatedOnly && r.status === "satisfied");
  const overclaimed = results.filter((r) => r.beyondAutomation && r.status === "satisfied");
  // A criterion that fails on the checkout page and was never looked at on the
  // account page is decided, but only for what was looked at. Without this the
  // gap would disappear behind the failure it shares a criterion with.
  const partlyCovered = results.filter(
    (r) => r.unevaluatedScopes.length > 0 && r.status !== "not-evaluated",
  );

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

  if (partlyCovered.length > 0) {
    reasons.push(
      `${partlyCovered.length} criteria are decided on part of the covered scopes only, and the rest is unknown rather than passing`,
    );
  }

  const agedOut = countStale(results, "aged-out");
  if (agedOut > 0) {
    reasons.push(`${agedOut} criteria rest on evidence older than ${staleAfterDays} days`);
  }

  const otherBuild = countStale(results, "other-build");
  if (build !== undefined && otherBuild > 0) {
    reasons.push(
      `${otherBuild} criteria rest on evidence from a build other than ${build}, and need re-checking`,
    );
  }

  const buildUnknown = countStale(results, "build-unknown");
  if (build !== undefined && buildUnknown > 0) {
    reasons.push(
      `${buildUnknown} criteria rest on evidence that does not say which build it was taken on`,
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

  return {
    level,
    status,
    build,
    results,
    failed,
    unevaluated,
    stale,
    recheck,
    unconfirmed,
    overclaimed,
    reasons,
  };
}

function countStale(results: readonly CriterionResult[], reason: StaleReason): number {
  return results.filter((r) => r.staleChecks.some((entry) => entry.reason === reason)).length;
}

function assessCriterion(
  criterion: Criterion,
  evidence: Evidence,
  scopes: readonly string[],
  asOf: Date,
  staleAfterDays: number,
  build: string | undefined,
): CriterionResult {
  const latest = evidence.latestPerScope(criterion.id).filter((c) => scopes.includes(c.scope));
  const covered = new Set(latest.map((check) => check.scope));
  const unevaluatedScopes = scopes.filter((scope) => !covered.has(scope));

  const staleBefore = asOf.getTime() - staleAfterDays * 24 * 60 * 60 * 1000;
  const staleChecks: StaleCheck[] = [];
  for (const check of latest) {
    const reason = staleness(check, staleBefore, build);
    if (reason) staleChecks.push({ check, reason });
  }

  const outcomes = new Set(latest.map((check) => check.outcome));
  const automatedOnly =
    latest.length > 0 && latest.every((check) => check.method === "automated");

  // The order matters. A failure anywhere outranks a pass everywhere else: a
  // criterion that fails on the checkout page is not satisfied because it holds
  // on the home page. But a gap in coverage is not a failure — it is a gap, and
  // reporting it as a failure would send someone to fix code that may be fine
  // while the actual answer is "nobody has looked at that page". A gap is not a
  // pass either: passing on the pages that were checked says nothing about the
  // ones that were not, so the criterion stays unevaluated until they are.
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
    checks: latest,
    unevaluatedScopes,
    staleChecks,
    automatedOnly,
    beyondAutomation: automatedOnly && !AUTOMATABLE.has(criterion.id),
  };
}

/**
 * Stale evidence is not voided evidence: it still says what somebody found,
 * and the claim keeps standing on it while saying so. What changes is that the
 * check lands on the list of things to re-run.
 *
 * The build is looked at before the date because when both apply, re-running
 * the check against the current build answers the age question too.
 */
function staleness(
  check: Check,
  staleBefore: number,
  build: string | undefined,
): StaleReason | undefined {
  if (build !== undefined) {
    if (check.build === undefined) return "build-unknown";
    if (check.build !== build) return "other-build";
  }
  if (Date.parse(check.checkedAt) < staleBefore) return "aged-out";
  return undefined;
}
