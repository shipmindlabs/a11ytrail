/**
 * What a scanner's output becomes, and what the import refuses to invent.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assess,
  criteriaFor,
  Evidence,
  fromScanner,
  InvalidScannerRun,
  statement,
  type Organisation,
  type ScannerResults,
  type ScannerRun,
} from "../src/index.ts";

const asOf = new Date("2026-08-16T00:00:00Z");

const run: ScannerRun = {
  scope: "checkout",
  tool: "axe-core 4.10",
  checkedAt: "2026-08-05",
  build: "2026.9.0",
};

const decided: Organisation = {
  name: "Example Ltd",
  service: "the Example web shop",
  feedbackContact: "accessibility@example.com",
  enforcementProcedure: "Complaints go to the national enforcement body.",
  assessmentMethod: "self-assessment against recorded evidence",
  lastReviewedOn: "2026-08-16",
  disproportionateBurden: [],
  outOfScope: [],
};

test("a tagged rule becomes an automated check, placed by what the caller supplies", () => {
  const checks = fromScanner(
    { violations: [{ id: "color-contrast", tags: ["cat.color", "wcag2aa", "wcag143"] }] },
    run,
  );

  assert.deepEqual(checks, [
    {
      criterion: "1.4.3",
      outcome: "failed",
      method: "automated",
      checkedAt: "2026-08-05",
      checkedBy: "axe-core 4.10",
      scope: "checkout",
      tool: "axe-core 4.10",
      build: "2026.9.0",
    },
  ]);
});

// Several rules carry the same criterion tag, and a claim is made of criteria.
test("rules that disagree about a criterion collapse into one check, worst outcome first", () => {
  const results: ScannerResults = {
    passes: [
      { id: "image-alt", tags: ["wcag111"] },
      { id: "label", tags: ["wcag412"] },
    ],
    violations: [{ id: "input-image-alt", tags: ["wcag111"] }],
  };

  assert.deepEqual(
    fromScanner(results, run).map((check) => [check.criterion, check.outcome]),
    [
      ["1.1.1", "failed"],
      ["4.1.2", "passed"],
    ],
  );
});

test("a result the scanner could not decide is inconclusive rather than a pass", () => {
  const checks = fromScanner(
    { passes: [{ tags: ["wcag143"] }], incomplete: [{ tags: ["wcag143"] }] },
    run,
  );

  assert.deepEqual(
    checks.map((check) => [check.criterion, check.outcome]),
    [["1.4.3", "inconclusive"]],
  );
});

// A rule that found nothing to look at says less than one that looked.
test("inapplicable is recorded, and yields to any rule that reached the content", () => {
  assert.deepEqual(
    fromScanner({ inapplicable: [{ tags: ["wcag122"] }] }, run).map((check) => [
      check.criterion,
      check.outcome,
    ]),
    [["1.2.2", "not-applicable"]],
  );

  assert.deepEqual(
    fromScanner(
      { inapplicable: [{ tags: ["wcag122"] }], passes: [{ tags: ["wcag122"] }] },
      run,
    ).map((check) => check.outcome),
    ["passed"],
  );
});

test("a tag that names no criterion in the catalogue produces no check", () => {
  const results: ScannerResults = {
    violations: [
      { id: "region", tags: ["best-practice", "cat.keyboard"] },
      { id: "duplicate-id", tags: ["wcag411"] },
      { id: "p-as-heading", tags: ["wcag146"] },
      { id: "html-has-lang", tags: ["wcag2a", "wcag311"] },
    ],
  };

  assert.deepEqual(
    fromScanner(results, run).map((check) => check.criterion),
    ["3.1.1"],
    "4.1.1 is gone from WCAG 2.2, 1.4.6 is AAA, and a best practice is not a criterion",
  );
});

test("a criterion number past nine is read as one number, not two", () => {
  assert.deepEqual(
    fromScanner({ passes: [{ tags: ["wcag2411"] }, { tags: ["wcag1410"] }] }, run).map(
      (check) => check.criterion,
    ),
    ["1.4.10", "2.4.11"],
  );
});

test("results with nothing in them import nothing", () => {
  assert.deepEqual(fromScanner({}, run), []);
  assert.deepEqual(fromScanner({ passes: [], violations: [{ tags: [] }] }, run), []);
});

test("the tool stands in for who ran it, unless the caller names someone", () => {
  const [anonymous] = fromScanner(
    { passes: [{ tags: ["wcag143"] }] },
    { scope: "home", tool: "axe-core", checkedAt: "2026-08-05" },
  );
  assert.equal(anonymous.checkedBy, "axe-core");
  assert.ok(!("build" in anonymous), "a run without a build must not invent one");

  const [attributed] = fromScanner({ passes: [{ tags: ["wcag143"] }] }, { ...run, checkedBy: "ci" });
  assert.equal(attributed.checkedBy, "ci");
});

test("a run that cannot be placed or reproduced is refused", () => {
  assert.throws(() => fromScanner({}, { ...run, tool: "  " }), InvalidScannerRun);
  assert.throws(() => fromScanner({}, { ...run, scope: "" }), InvalidScannerRun);
  assert.throws(() => fromScanner({}, { ...run, checkedAt: "last tuesday" }), InvalidScannerRun);
  assert.throws(() => fromScanner({}, { ...run, build: " " }), InvalidScannerRun);
});

test("imported checks are evidence, and are reported as resting on a scanner alone", () => {
  const evidence = new Evidence(
    fromScanner({ passes: [{ tags: ["wcag143"] }, { tags: ["wcag111"] }] }, run),
  );

  const claim = assess(evidence, { asOf, build: "2026.9.0" });

  assert.deepEqual(
    claim.unconfirmed.map((result) => result.criterion.id),
    ["1.1.1", "1.4.3"],
  );
  assert.deepEqual(
    claim.overclaimed.map((result) => result.criterion.id),
    ["1.1.1"],
    "no scanner settles whether alt text describes the image",
  );
  assert.equal(claim.status, "incomplete");
  assert.deepEqual(claim.recheck, []);
});

// The import places the result; it does not pretend to know what it means.
test("a violation imported from a scanner still asks a person what it means", () => {
  const evidence = new Evidence();
  for (const criterion of criteriaFor("AA")) {
    evidence.add({
      criterion: criterion.id,
      outcome: "passed",
      method: "manual",
      checkedAt: "2026-08-01",
      checkedBy: "audit team",
      scope: "checkout",
      build: "2026.9.0",
    });
  }
  for (const check of fromScanner(
    { violations: [{ id: "color-contrast", tags: ["wcag143"] }] },
    run,
  )) {
    evidence.add(check);
  }

  const published = statement(assess(evidence, { asOf, build: "2026.9.0" }), decided, asOf);

  assert.equal(published.status, "partially compliant");
  assert.deepEqual(
    published.nonAccessibleContent.map((item) => item.criterion),
    ["1.4.3"],
  );
  assert.equal(published.nonAccessibleContent[0].reason, undefined);
  assert.deepEqual(
    published.pending.map((item) => item.id),
    ["reason:1.4.3", "alternative:1.4.3"],
  );
});
