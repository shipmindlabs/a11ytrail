/**
 * Importing what a scanner produced.
 *
 * axe-core and the tools built on it report in four buckets — passes,
 * violations, incomplete, inapplicable — and tag every rule with the success
 * criteria it belongs to. That is enough to place a result and not enough to
 * situate it: the scope, the build, the date and the tool come from the caller,
 * because a JSON blob does not know which page or which release it describes.
 *
 * One check comes out per criterion and scope, because a criterion is what a
 * claim is made of and a rule is not. Several rules carry the same tag and they
 * can disagree, so the worst outcome wins: a violation outranks everything, a
 * result the scanner could not decide outranks a pass, and inapplicable is the
 * weakest — a rule that found nothing to look at says less than one that
 * looked.
 *
 * Nothing is written into the note. The rule behind a violation is not a
 * description of what a person runs into, so the statement goes on asking for
 * one.
 */

import { CRITERIA, criterion } from "./criteria.ts";
import type { Check, Outcome } from "./evidence.ts";

export type ScannerRule = {
  /** The rule's own id, e.g. "color-contrast". */
  readonly id?: string;
  /** The rule's tags. The ones naming a success criterion decide where it lands. */
  readonly tags?: readonly string[];
};

/** The shape axe-core and the tools built on it report in. */
export type ScannerResults = {
  readonly passes?: readonly ScannerRule[];
  readonly violations?: readonly ScannerRule[];
  readonly incomplete?: readonly ScannerRule[];
  readonly inapplicable?: readonly ScannerRule[];
};

/** What the results cannot say about themselves. */
export type ScannerRun = {
  /** What was scanned: a page, a view, a component. */
  readonly scope: string;
  /** The tool that produced the results, with its version if you have it. */
  readonly tool: string;
  /** ISO date of the run. */
  readonly checkedAt: string;
  /** The build the run applies to — a version, a tag, a commit. */
  readonly build?: string;
  /** Who ran it. Defaults to the tool. */
  readonly checkedBy?: string;
};

/** The results cannot be turned into evidence as asked. */
export class InvalidScannerRun extends Error {}

const BUCKETS: readonly (readonly [keyof ScannerResults, Outcome])[] = [
  ["violations", "failed"],
  ["incomplete", "inconclusive"],
  ["passes", "passed"],
  ["inapplicable", "not-applicable"],
];

/**
 * Criterion tags are the digits run together: wcag143 is 1.4.3, wcag2411 is
 * 2.4.11. Level and version tags (wcag2aa, wcag21aa) carry letters and so match
 * nothing here, which is what should happen to them.
 */
const CRITERION_TAG = /^wcag(\d)(\d)(\d+)$/;

const ORDER = new Map(CRITERIA.map((entry, index) => [entry.id, index]));

export function fromScanner(results: ScannerResults, run: ScannerRun): readonly Check[] {
  validate(run);

  const worst = new Map<string, number>();
  for (const [rank, [bucket]] of BUCKETS.entries()) {
    for (const rule of results[bucket] ?? []) {
      for (const id of criteriaOf(rule)) {
        const held = worst.get(id);
        if (held === undefined || rank < held) worst.set(id, rank);
      }
    }
  }

  return [...worst]
    .sort(([a], [b]) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0))
    .map(([id, rank]): Check => ({
      criterion: id,
      outcome: BUCKETS[rank][1],
      method: "automated",
      checkedAt: run.checkedAt,
      checkedBy: run.checkedBy?.trim() ? run.checkedBy : run.tool,
      scope: run.scope,
      tool: run.tool,
      ...(run.build === undefined ? {} : { build: run.build }),
    }));
}

/** The criteria a rule speaks for. A tag outside the catalogue speaks for none. */
function criteriaOf(rule: ScannerRule): readonly string[] {
  const ids: string[] = [];
  for (const tag of rule.tags ?? []) {
    const match = CRITERION_TAG.exec(tag);
    if (!match) continue;
    const id = `${match[1]}.${match[2]}.${match[3]}`;
    if (criterion(id)) ids.push(id);
  }
  return ids;
}

function validate(run: ScannerRun): void {
  if (!run.tool.trim()) {
    throw new InvalidScannerRun(
      "the scanner run does not name the tool: a result nobody can reproduce is not evidence",
    );
  }
  if (!run.scope.trim()) {
    throw new InvalidScannerRun(
      "the scanner run does not say what was scanned, and a result that covers nothing in particular supports nothing",
    );
  }
  if (Number.isNaN(Date.parse(run.checkedAt))) {
    throw new InvalidScannerRun(`the scanner run has an unreadable date: "${run.checkedAt}"`);
  }
  if (run.build !== undefined && !run.build.trim()) {
    throw new InvalidScannerRun(
      "the scanner run carries an empty build: leave it out rather than recording a build nobody can identify",
    );
  }
}
