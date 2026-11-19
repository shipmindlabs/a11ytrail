/**
 * Edge cases and failure modes of the parts added last: the build a claim is
 * assessed against, the date it is made as of, the scanner import, and what the
 * statement does with the parts a record of tests cannot answer.
 *
 * These are the cases the happy path steps over — the boundary of a single day,
 * evidence that arrives after the question was asked, a page nobody reached
 * standing next to one that failed, rules that name nothing at all — and they
 * are where a report stops matching the trail under it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assess,
  criteriaFor,
  Evidence,
  fromScanner,
  InvalidAssessment,
  statement,
  toMarkdown,
  UnsupportedClaim,
  type Check,
  type Organisation,
  type ScannerRun,
} from "../src/index.ts";

const asOf = new Date("2026-08-16T00:00:00Z");

const ALL = criteriaFor("AA").length;

const run: ScannerRun = {
  scope: "checkout",
  tool: "axe-core 4.10",
  checkedAt: "2026-08-05",
};

/** An organisation that has answered everything only it can answer. */
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

function check(overrides: Partial<Check> & Pick<Check, "criterion">): Check {
  return {
    outcome: "passed",
    method: "manual",
    checkedAt: "2026-08-01",
    checkedBy: "auditor",
    scope: "home",
    ...overrides,
  };
}

/** A manual pass on every criterion at a level, on each scope given. */
function fullPass(
  options: {
    readonly scopes?: readonly string[];
    readonly checkedAt?: string;
    readonly build?: string;
    readonly level?: "A" | "AA";
  } = {},
): Evidence {
  const evidence = new Evidence();
  for (const criterion of criteriaFor(options.level ?? "AA")) {
    for (const scope of options.scopes ?? ["home"]) {
      evidence.add(
        check({
          criterion: criterion.id,
          scope,
          checkedAt: options.checkedAt ?? "2026-08-01",
          ...(options.build ? { build: options.build } : {}),
        }),
      );
    }
  }
  return evidence;
}

// The boundary of asOf is a whole day: a check dated that day was known, one
// dated the next day was not.
test("a check dated on the day of the assessment counts; one dated after it does not", () => {
  const sameDay = assess(fullPass({ checkedAt: "2026-08-16" }), { asOf });

  assert.equal(sameDay.status, "conformant");
  assert.ok(!sameDay.reasons.some((reason) => /set aside/.test(reason)));

  const later = assess(fullPass({ checkedAt: "2026-08-17" }), { asOf });

  assert.equal(later.status, "incomplete");
  assert.equal(later.reasons[0], "no evidence has been recorded");
  assert.ok(
    later.reasons.some((reason) => reason.startsWith(`${ALL} checks are dated after 2026-08-16`)),
  );
});

// Coverage is read off the evidence as it stood, so a page whose audit happens
// next month is not a gap in a claim made today — it is not in the claim.
test("a page whose only checks come later is outside the claim, not a gap in it", () => {
  const evidence = fullPass();
  for (const criterion of criteriaFor("AA")) {
    evidence.add(check({ criterion: criterion.id, scope: "checkout", checkedAt: "2026-09-01" }));
  }

  const august = assess(evidence, { asOf });

  assert.equal(august.status, "conformant");
  assert.ok(august.results.every((result) => result.unevaluatedScopes.length === 0));
  assert.ok(
    august.reasons.some((reason) => reason.startsWith(`${ALL} checks are dated after 2026-08-16`)),
  );

  const september = assess(evidence, { asOf: new Date("2026-09-15T00:00:00Z") });

  assert.equal(september.status, "conformant");
  assert.deepEqual(
    [...new Set(september.results.flatMap((result) => result.checks.map((c) => c.scope)))].sort(),
    ["checkout", "home"],
  );
  assert.ok(!september.reasons.some((reason) => /set aside/.test(reason)));
});

test("asked about a page nothing covers, every criterion is unevaluated rather than passing", () => {
  const claim = assess(fullPass(), { asOf, scopes: ["account"] });

  assert.equal(claim.status, "incomplete");
  assert.equal(claim.unevaluated.length, ALL);
  assert.deepEqual(claim.results[0].unevaluatedScopes, ["account"]);
  assert.deepEqual(claim.results[0].checks, []);
});

test("narrowing the scopes narrows the claim to what those pages say", () => {
  const evidence = fullPass({ scopes: ["home", "checkout"] });
  evidence.add(
    check({ criterion: "1.4.3", scope: "checkout", outcome: "failed", checkedAt: "2026-08-10" }),
  );

  assert.equal(assess(evidence, { asOf }).status, "partially-conformant");
  assert.equal(assess(evidence, { asOf, scopes: ["home"] }).status, "conformant");
});

test("the staleness window closes the day after the window, not on it", () => {
  const onTheEdge = assess(fullPass({ checkedAt: "2025-08-16" }), { asOf, staleAfterDays: 365 });

  assert.deepEqual(onTheEdge.stale, []);
  assert.deepEqual(onTheEdge.recheck, []);

  const over = assess(fullPass({ checkedAt: "2025-08-15" }), { asOf, staleAfterDays: 365 });

  assert.equal(over.stale.length, over.results.length);
  assert.ok(over.recheck.every((item) => item.reason === "aged-out"));
});

// Re-running the check names the build this time, which answers the age
// question as well, so the unknown build is the reason given.
test("evidence that names no build is work to redo for that reason, whatever its age", () => {
  const claim = assess(fullPass({ checkedAt: "2020-01-01" }), { asOf, build: "2026.9.0" });

  assert.ok(claim.recheck.every((item) => item.reason === "build-unknown"));
  assert.ok(claim.recheck.every((item) => item.lastBuild === undefined));
  assert.match(claim.reasons.join(" "), /does not say which build/);
  assert.ok(!claim.reasons.some((reason) => /older than/.test(reason)));
});

test("the re-check list names the work once per scope, however many checks preceded it", () => {
  const evidence = new Evidence()
    .add(check({ criterion: "1.4.3", checkedAt: "2026-07-01", build: "2026.8.0" }))
    .add(check({ criterion: "1.4.3", checkedAt: "2026-08-01", build: "2026.8.1" }));

  const claim = assess(evidence, { asOf, build: "2026.9.0" });

  assert.deepEqual(
    claim.recheck.map((item) => [item.criterion.id, item.scope, item.lastBuild]),
    [["1.4.3", "home", "2026.8.1"]],
  );
  assert.equal(claim.stale.length, 1);
});

test("a re-test recorded on the same day supersedes the record it corrects", () => {
  const evidence = new Evidence()
    .add(check({ criterion: "1.4.3", outcome: "failed", note: "3.1:1" }))
    .add(check({ criterion: "1.4.3", outcome: "passed", note: "re-measured: 4.8:1" }));

  assert.deepEqual(
    evidence.latestPerScope("1.4.3").map((c) => [c.outcome, c.note]),
    [["passed", "re-measured: 4.8:1"]],
  );
});

test("among several checks on the build being assessed, the latest one speaks", () => {
  const evidence = new Evidence()
    .add(
      check({
        criterion: "1.4.3",
        outcome: "failed",
        checkedAt: "2026-08-10",
        build: "2026.9.0",
      }),
    )
    .add(
      check({
        criterion: "1.4.3",
        outcome: "passed",
        checkedAt: "2026-08-02",
        build: "2026.9.0",
      }),
    );

  assert.deepEqual(
    evidence.latestPerScope("1.4.3", "2026.9.0").map((c) => [c.outcome, c.checkedAt]),
    [["failed", "2026-08-10"]],
  );
});

// A claim is about the build its evidence speaks from, which is not every build
// the trail happens to mention.
test("a superseded build is not one the claim rests on", () => {
  const evidence = new Evidence()
    .add(check({ criterion: "1.4.3", checkedAt: "2026-08-01", build: "2026.8.1" }))
    .add(check({ criterion: "1.4.3", checkedAt: "2026-08-10", build: "2026.9.0" }));

  assert.deepEqual(evidence.builds, ["2026.8.1", "2026.9.0"]);

  const claim = assess(evidence, { asOf });

  assert.deepEqual(claim.builds, ["2026.9.0"]);
  assert.ok(!claim.reasons.some((reason) => /spans/.test(reason)));
});

// Naming a build changes which check speaks, so it can also change who checked:
// the person looked at the release before, the scanner at this one.
test("naming a build can leave a criterion resting on the scanner that ran against it", () => {
  const evidence = new Evidence()
    .add(check({ criterion: "1.1.1", checkedAt: "2026-08-05", build: "2026.8.1" }))
    .add(
      check({
        criterion: "1.1.1",
        checkedAt: "2026-08-01",
        build: "2026.9.0",
        method: "automated",
        tool: "axe-core 4.10",
        checkedBy: "ci",
      }),
    );

  const onBuild = assess(evidence, { asOf, build: "2026.9.0" });

  assert.deepEqual(
    onBuild.unconfirmed.map((result) => result.criterion.id),
    ["1.1.1"],
  );
  assert.deepEqual(
    onBuild.overclaimed.map((result) => result.criterion.id),
    ["1.1.1"],
  );

  const anyBuild = assess(evidence, { asOf });

  assert.deepEqual(anyBuild.unconfirmed, [], "the person looked last, on another build");
  assert.deepEqual(anyBuild.overclaimed, []);
});

test("a staleness window that is not a finite number of days is refused", () => {
  assert.throws(
    () => assess(fullPass(), { asOf, staleAfterDays: Number.POSITIVE_INFINITY }),
    InvalidAssessment,
  );
  assert.throws(() => assess(fullPass(), { asOf, staleAfterDays: Number.NaN }), InvalidAssessment);
});

test("a page the auditor could not decide blocks the claim, though another page passed", () => {
  const evidence = fullPass({ scopes: ["home", "checkout"] });
  evidence.add(
    check({
      criterion: "1.3.1",
      scope: "checkout",
      outcome: "inconclusive",
      checkedAt: "2026-08-10",
    }),
  );

  const claim = assess(evidence, { asOf });

  assert.equal(claim.status, "incomplete");
  assert.deepEqual(
    claim.unevaluated.map((result) => result.criterion.id),
    ["1.3.1"],
  );
  assert.equal(claim.results.find((r) => r.criterion.id === "1.3.1")!.status, "inconclusive");
  assert.throws(() => statement(claim, decided, asOf), UnsupportedClaim);
});

test("a rule tagged with the same criterion twice produces one check", () => {
  const checks = fromScanner(
    { violations: [{ id: "color-contrast", tags: ["wcag143", "wcag143"] }] },
    run,
  );

  assert.equal(checks.length, 1);
  assert.equal(checks[0].criterion, "1.4.3");
});

test("a rule with no tags, and a bucket left out, import nothing", () => {
  assert.deepEqual(fromScanner({ violations: [{ id: "region" }] }, run), []);
  assert.deepEqual(fromScanner({ incomplete: [{}] }, run), []);
});

// A tag is the whole token, not a string a criterion can be found inside.
test("a criterion tag is matched whole", () => {
  assert.deepEqual(
    fromScanner({ violations: [{ tags: ["wcag143 ", "xwcag143", "wcag143x", "wcag14"] }] }, run),
    [],
  );
});

test("a tag whose digits name no criterion lands nowhere", () => {
  assert.deepEqual(fromScanner({ violations: [{ tags: ["wcag999", "wcag1431"] }] }, run), []);
});

test("whitespace where the caller should have named someone falls back to the tool", () => {
  const [imported] = fromScanner({ passes: [{ tags: ["wcag143"] }] }, { ...run, checkedBy: "   " });

  assert.equal(imported.checkedBy, "axe-core 4.10");
});

test("every bucket a scanner reports becomes evidence the trail accepts", () => {
  const checks = fromScanner(
    {
      violations: [{ tags: ["wcag111"] }],
      incomplete: [{ tags: ["wcag143"] }],
      passes: [{ tags: ["wcag412"] }],
      inapplicable: [{ tags: ["wcag122"] }],
    },
    run,
  );

  assert.deepEqual(
    new Evidence(checks).checks.map((c) => [c.criterion, c.outcome]),
    [
      ["1.1.1", "failed"],
      ["1.2.2", "not-applicable"],
      ["1.4.3", "inconclusive"],
      ["4.1.2", "passed"],
    ],
  );
});

test("a claim where nothing is satisfied publishes as non-compliant", () => {
  const evidence = new Evidence();
  for (const criterion of criteriaFor("A")) {
    evidence.add(check({ criterion: criterion.id, outcome: "failed", note: "not implemented" }));
  }

  const claim = assess(evidence, { asOf, level: "A" });

  assert.equal(claim.status, "non-conformant");
  assert.match(claim.reasons.join(" "), /no criterion is satisfied/);

  const published = statement(claim, decided, asOf);

  assert.equal(published.status, "non-compliant");
  assert.equal(published.nonAccessibleContent.length, criteriaFor("A").length);
  assert.deepEqual(
    published.pending.map((item) => item.id),
    criteriaFor("A").map((criterion) => `alternative:${criterion.id}`),
  );
  assert.ok(toMarkdown(published).includes("**non-compliant**"));
});

// The two live on the same criterion and mean different things: one page is
// broken, another was never looked at, and the statement has to say both.
test("a failure on one page and no check at all on another are declared as both", () => {
  const evidence = new Evidence();
  for (const criterion of criteriaFor("AA")) {
    for (const scope of ["home", "checkout", "account"]) {
      if (criterion.id === "1.4.3" && scope === "account") continue;
      const fails = criterion.id === "1.4.3" && scope === "checkout";
      evidence.add(
        check({
          criterion: criterion.id,
          scope,
          outcome: fails ? "failed" : "passed",
          ...(fails ? { note: "the promo price text sits at 3.1:1" } : {}),
        }),
      );
    }
  }

  const claim = assess(evidence, { asOf });

  assert.equal(claim.status, "partially-conformant");
  assert.equal(claim.results.find((r) => r.criterion.id === "1.4.3")!.status, "partial");
  assert.match(claim.reasons.join(" "), /1 criteria are decided on part of the covered scopes only/);

  const published = statement(claim, decided, asOf);
  const item = published.nonAccessibleContent[0];

  assert.deepEqual(item.failingScopes, ["checkout"]);
  assert.deepEqual(item.uncheckedScopes, ["account"]);
  assert.equal(item.reason, "the promo price text sits at 3.1:1");
  assert.deepEqual(
    published.pending.map((decision) => decision.id),
    ["alternative:1.4.3"],
  );

  const markdown = toMarkdown(published);

  assert.ok(markdown.includes("— fails on: checkout"));
  assert.ok(markdown.includes("Not checked at all on: account — unknown rather than working."));
});

test("the reasons recorded against several failing pages are joined, and repeats collapse", () => {
  const evidence = fullPass({ scopes: ["home", "checkout"] });
  for (const scope of ["home", "checkout"]) {
    evidence.add(
      check({
        criterion: "2.1.1",
        scope,
        outcome: "failed",
        checkedAt: "2026-08-10",
        note: "the date picker is mouse-only",
      }),
    );
  }
  evidence.add(
    check({
      criterion: "2.4.3",
      scope: "home",
      outcome: "failed",
      checkedAt: "2026-08-10",
      note: "focus jumps to the footer",
    }),
  );
  evidence.add(
    check({
      criterion: "2.4.3",
      scope: "checkout",
      outcome: "failed",
      checkedAt: "2026-08-10",
      note: "  the modal traps focus  ",
    }),
  );

  const published = statement(assess(evidence, { asOf }), decided, asOf);

  assert.equal(
    published.nonAccessibleContent.find((item) => item.criterion === "2.1.1")!.reason,
    "the date picker is mouse-only",
  );
  assert.equal(
    published.nonAccessibleContent.find((item) => item.criterion === "2.4.3")!.reason,
    "the modal traps focus; focus jumps to the footer",
  );
});

test("a note that is only whitespace is not a description of a barrier", () => {
  const evidence = fullPass();
  evidence.add(
    check({ criterion: "2.1.1", outcome: "failed", checkedAt: "2026-08-10", note: "   " }),
  );

  const published = statement(assess(evidence, { asOf }), decided, asOf);

  assert.equal(published.nonAccessibleContent[0].reason, undefined);
  assert.deepEqual(
    published.pending.map((decision) => decision.id),
    ["reason:2.1.1", "alternative:2.1.1"],
  );
});

test("an alternative offered for a criterion that holds is not published", () => {
  const evidence = fullPass();
  evidence.add(
    check({
      criterion: "2.1.1",
      outcome: "failed",
      checkedAt: "2026-08-10",
      note: "the date picker is mouse-only",
    }),
  );

  const published = statement(
    assess(evidence, { asOf }),
    {
      ...decided,
      alternatives: {
        "2.1.1": "the date can be typed into the field next to it",
        "3.3.1": "a telephone line",
      },
    },
    asOf,
  );

  assert.deepEqual(published.pending, []);

  const markdown = toMarkdown(published);

  assert.ok(markdown.includes("the date can be typed into the field next to it"));
  assert.ok(!markdown.includes("a telephone line"), "3.3.1 holds, so nothing is offered instead");
});

test("the statement is dated when it is prepared, not when the evidence was assessed", () => {
  const published = statement(
    assess(fullPass(), { asOf }),
    decided,
    new Date("2026-09-01T23:30:00Z"),
  );

  assert.equal(published.preparedOn, "2026-09-01");
  assert.ok(toMarkdown(published).includes("This statement was prepared on 2026-09-01."));
});

// Same rule as the assessment method: blank is not an answer, and what was
// handed over is printed as given rather than quietly replaced.
test("a blank review date stays pending, and the blank is printed as it was given", () => {
  const published = statement(
    assess(fullPass(), { asOf }),
    { ...decided, lastReviewedOn: " " },
    asOf,
  );

  assert.deepEqual(
    published.pending.map((decision) => decision.id),
    ["last-review"],
  );

  const markdown = toMarkdown(published);

  assert.ok(markdown.includes("Last reviewed on:  ."));
  assert.ok(!markdown.includes("**[needs a human decision]** Give the date"));
  assert.ok(markdown.includes("Draft: 1 part(s) of this statement need a human decision"));
});

// An exemption nobody has answered is content the statement still has to
// account for, so the section opens even when every criterion is satisfied.
test("a declared-empty exemption prints no heading; an unanswered one opens the section", () => {
  const published = statement(
    assess(fullPass(), { asOf }),
    { ...decided, disproportionateBurden: [], outOfScope: undefined },
    asOf,
  );

  assert.deepEqual(
    published.pending.map((decision) => decision.id),
    ["out-of-scope"],
  );

  const markdown = toMarkdown(published);

  assert.ok(markdown.includes("## Non-accessible content"));
  assert.ok(!markdown.includes("### Disproportionate burden"));
  assert.ok(markdown.includes("### Content outside the scope of the legislation"));
  assert.ok(!markdown.includes("### Non-compliance with the accessibility requirements"));
});

test("the statement names the level the claim was made at", () => {
  const published = statement(
    assess(fullPass({ level: "A" }), { asOf, level: "A" }),
    decided,
    asOf,
  );

  assert.equal(published.level, "WCAG 2.2 level A");
  assert.ok(toMarkdown(published).includes("is **fully compliant** with WCAG 2.2 level A."));
});
