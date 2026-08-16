/**
 * What was checked, how, by whom, and when.
 *
 * A conformance claim is only as good as the evidence behind it, and the part
 * that rots is the "when": a page audited eighteen months and four redesigns
 * ago supports nothing. Every check carries its date so that staleness is
 * visible rather than assumed away.
 */

import { criterion } from "./criteria.ts";

export type Method =
  /** A scanner. Fast, repeatable, and blind to meaning. */
  | "automated"
  /** A person following a procedure. */
  | "manual"
  /** A person using a screen reader, magnifier or switch. */
  | "assistive-technology"
  /** People with disabilities using the real thing. */
  | "user-testing";

export type Outcome =
  | "passed"
  | "failed"
  /** The criterion cannot apply here — no audio, no video, no timing. */
  | "not-applicable"
  /** Looked at, could not decide. Never counts as a pass. */
  | "inconclusive";

export type Check = {
  /** Success criterion id, e.g. "1.4.3". */
  readonly criterion: string;
  readonly outcome: Outcome;
  readonly method: Method;
  /** ISO date the check was performed. */
  readonly checkedAt: string;
  /** Who performed it — a person or a tool. Anonymous evidence is not evidence. */
  readonly checkedBy: string;
  /** What was checked: a page, a view, a component. */
  readonly scope: string;
  readonly tool?: string;
  readonly note?: string;
};

export class InvalidCheck extends Error {}

function validate(check: Check): void {
  if (!criterion(check.criterion)) {
    throw new InvalidCheck(
      `unknown success criterion "${check.criterion}": evidence for a criterion that does not exist cannot support a claim`,
    );
  }
  if (Number.isNaN(Date.parse(check.checkedAt))) {
    throw new InvalidCheck(`check for ${check.criterion} has an unreadable date: "${check.checkedAt}"`);
  }
  if (!check.checkedBy.trim()) {
    throw new InvalidCheck(`check for ${check.criterion} says nobody performed it`);
  }
  if (!check.scope.trim()) {
    throw new InvalidCheck(`check for ${check.criterion} does not say what was checked`);
  }
  if (check.method === "automated" && !check.tool?.trim()) {
    throw new InvalidCheck(
      `automated check for ${check.criterion} does not name the tool: a result nobody can reproduce is not evidence`,
    );
  }
}

/** A collection of checks, kept in the order they were recorded. */
export class Evidence {
  #checks: Check[] = [];

  constructor(checks: readonly Check[] = []) {
    for (const check of checks) this.add(check);
  }

  get checks(): readonly Check[] {
    return this.#checks;
  }

  add(check: Check): this {
    validate(check);
    this.#checks.push(check);
    return this;
  }

  /** Every check recorded for one criterion. */
  for(criterionId: string): readonly Check[] {
    return this.#checks.filter((check) => check.criterion === criterionId);
  }

  /** The scopes that appear anywhere in the evidence. */
  get scopes(): readonly string[] {
    return [...new Set(this.#checks.map((check) => check.scope))].sort();
  }

  /**
   * The most recent check per scope for a criterion. A later check supersedes
   * an earlier one for the same scope — that is what re-testing after a fix
   * means — but a pass on one page never speaks for another.
   */
  latestPerScope(criterionId: string): readonly Check[] {
    const latest = new Map<string, Check>();
    for (const check of this.for(criterionId)) {
      const held = latest.get(check.scope);
      if (!held || Date.parse(check.checkedAt) >= Date.parse(held.checkedAt)) {
        latest.set(check.scope, check);
      }
    }
    return [...latest.values()].sort((a, b) => (a.scope < b.scope ? -1 : 1));
  }

  toJSON(): readonly Check[] {
    return this.checks;
  }

  static fromJSON(checks: readonly Check[]): Evidence {
    return new Evidence(checks);
  }
}
