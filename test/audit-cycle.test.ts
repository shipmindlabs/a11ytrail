/**
 * One audit from end to end: nothing recorded, a scanner pass, a manual audit
 * that leaves a page unreached, the gap closed, the defect fixed, and then a
 * release that breaks something which used to hold.
 *
 * Each stage is built from the one before it, so what the claim and the
 * statement say at each point is read off the same growing trail rather than a
 * fixture arranged to produce the answer.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assess,
  AUTOMATABLE,
  criteriaFor,
  Evidence,
  statement,
  toMarkdown,
  UnsupportedClaim,
  type Check,
  type Organisation,
} from "../src/index.ts";

const SCOPES = ["home", "checkout"] as const;

const FIRST_BUILD = "2026.8.0";
const FIX_BUILD = "2026.8.1";
const NEW_BUILD = "2026.9.0";

const SCANNED = "2026-08-01";
const AUDITED = "2026-08-05";
const GAP_CLOSED = "2026-08-14";
const FIXED = "2026-08-20";
const REAUDITED = "2026-09-10";

const asOf = new Date("2026-08-31T00:00:00Z");
const shipped = new Date("2026-09-15T00:00:00Z");

const CONTRAST_NOTE = "the promo banner price text sits at 3.1:1 on the checkout page";
const FOCUS_NOTE = "the restyled buttons drop the focus outline, so keyboard position is invisible";

const ALL = criteriaFor("AA").length;

/** An organisation that has answered nothing only it can answer. */
const drafting: Organisation = {
  name: "Example Ltd",
  service: "the Example web shop",
  feedbackContact: "accessibility@example.com",
  enforcementProcedure: "Complaints go to the national enforcement body.",
  assessmentMethod: "self-assessment against recorded evidence",
};

/** The same organisation once the judgements have been made. */
const decided: Organisation = {
  ...drafting,
  lastReviewedOn: "2026-08-31",
  disproportionateBurden: [],
  outOfScope: [],
};

function check(overrides: Partial<Check> & Pick<Check, "criterion" | "scope">): Check {
  return {
    outcome: "passed",
    method: "manual",
    checkedAt: AUDITED,
    checkedBy: "audit team",
    ...overrides,
  };
}

/** CI runs a scanner over both pages, which settles the seven criteria it can. */
function scanned(): Evidence {
  const evidence = new Evidence();
  for (const criterion of criteriaFor("AA")) {
    if (!AUTOMATABLE.has(criterion.id)) continue;
    for (const scope of SCOPES) {
      evidence.add(
        check({
          criterion: criterion.id,
          scope,
          method: "automated",
          tool: "axe-core 4.10",
          checkedBy: "ci",
          checkedAt: SCANNED,
          build: FIRST_BUILD,
        }),
      );
    }
  }
  return evidence;
}

/** A person then goes through both pages, runs out of time on one, finds one defect. */
function audited(): Evidence {
  const evidence = scanned();
  for (const criterion of criteriaFor("AA")) {
    for (const scope of SCOPES) {
      if (criterion.id === "2.4.7" && scope === "checkout") continue;
      const fails = criterion.id === "1.4.3" && scope === "checkout";
      evidence.add(
        check({
          criterion: criterion.id,
          scope,
          checkedAt: AUDITED,
          build: FIRST_BUILD,
          outcome: fails ? "failed" : "passed",
          ...(fails ? { note: CONTRAST_NOTE } : {}),
        }),
      );
    }
  }
  return evidence;
}

function gapClosed(): Evidence {
  return audited().add(
    check({ criterion: "2.4.7", scope: "checkout", checkedAt: GAP_CLOSED, build: FIRST_BUILD }),
  );
}

function fixed(): Evidence {
  return gapClosed().add(
    check({ criterion: "1.4.3", scope: "checkout", checkedAt: FIXED, build: FIX_BUILD }),
  );
}

/** The next release ships, and the re-audit finds focus visibility gone. */
function regressed(): Evidence {
  const evidence = fixed();
  for (const criterion of criteriaFor("AA")) {
    for (const scope of SCOPES) {
      const fails = criterion.id === "2.4.7";
      evidence.add(
        check({
          criterion: criterion.id,
          scope,
          checkedAt: REAUDITED,
          build: NEW_BUILD,
          outcome: fails ? "failed" : "passed",
          ...(fails ? { note: FOCUS_NOTE } : {}),
        }),
      );
    }
  }
  return evidence;
}

test("stage 0: nothing has been recorded, so there is nothing to publish", () => {
  const claim = assess(new Evidence(), { asOf });

  assert.equal(claim.status, "incomplete");
  assert.deepEqual(claim.reasons, ["no evidence has been recorded"]);
  assert.equal(claim.results.length, ALL);
  assert.ok(claim.results.every((result) => result.status === "not-evaluated"));
  assert.throws(() => statement(claim, decided, asOf), UnsupportedClaim);
});

// The scanner is honest about what it settled; the claim has to be honest about
// the rest, which is most of the standard.
test("stage 1: a scanner pass leaves most of the standard unevaluated", () => {
  const claim = assess(scanned(), { asOf, build: FIRST_BUILD });

  assert.equal(claim.status, "incomplete");
  assert.equal(claim.unevaluated.length, ALL - AUTOMATABLE.size);
  assert.deepEqual(
    claim.unconfirmed.map((result) => result.criterion.id).sort(),
    [...AUTOMATABLE].sort(),
  );
  assert.deepEqual(claim.overclaimed, [], "the scanner only spoke where a scanner can");
  assert.match(claim.reasons.join(" "), /automated checks alone/);
  assert.throws(() => statement(claim, decided, asOf), UnsupportedClaim);
});

test("stage 2: the manual audit decides the rest, and the page nobody reached is a gap", () => {
  const claim = assess(audited(), { asOf, build: FIRST_BUILD });

  assert.equal(claim.status, "incomplete");
  assert.deepEqual(
    claim.unevaluated.map((result) => result.criterion.id),
    ["2.4.7"],
  );
  assert.deepEqual(claim.unevaluated[0].unevaluatedScopes, ["checkout"]);

  assert.deepEqual(
    claim.failed.map((result) => result.criterion.id),
    ["1.4.3"],
    "the unreached page must not be reported as a defect",
  );
  assert.equal(claim.results.find((r) => r.criterion.id === "1.4.3")!.status, "partial");

  // A person looked at every page the scanner had, and later, so nothing rests
  // on the scanner alone any more.
  assert.deepEqual(claim.unconfirmed, []);
  assert.throws(() => statement(claim, decided, asOf), UnsupportedClaim);
});

test("stage 3: closing the gap makes a claim that can be published", () => {
  const claim = assess(gapClosed(), { asOf, build: FIRST_BUILD });
  assert.equal(claim.status, "partially-conformant");

  const s = statement(claim, drafting, asOf);

  assert.equal(s.status, "partially compliant");
  assert.equal(s.preparedOn, "2026-08-31");
  assert.deepEqual(
    s.nonAccessibleContent.map((item) => item.criterion),
    ["1.4.3"],
  );
  assert.deepEqual(s.nonAccessibleContent[0].failingScopes, ["checkout"]);
  assert.equal(s.nonAccessibleContent[0].reason, CONTRAST_NOTE);
  assert.deepEqual(
    s.pending.map((item) => item.id),
    ["alternative:1.4.3", "disproportionate-burden", "out-of-scope", "last-review"],
  );

  const markdown = toMarkdown(s);
  assert.ok(markdown.includes("Draft: 4 part(s)"));
  assert.ok(markdown.includes(CONTRAST_NOTE));
  assert.ok(markdown.includes("**partially compliant**"));
});

test("stage 4: the fix is recorded as a later check, and the failure stays in the trail", () => {
  const evidence = fixed();

  assert.deepEqual(
    evidence
      .for("1.4.3")
      .filter((c) => c.scope === "checkout")
      .map((c) => [c.checkedAt, c.outcome]),
    [
      [SCANNED, "passed"],
      [AUDITED, "failed"],
      [FIXED, "passed"],
    ],
  );

  const claim = assess(evidence, { asOf, build: FIX_BUILD });

  assert.equal(claim.status, "conformant");
  assert.deepEqual(claim.builds, [FIRST_BUILD, FIX_BUILD]);
  // Only the re-check was taken on the build being assessed; everything else
  // describes the build before it and is work to redo, not a failure.
  assert.equal(claim.recheck.length, ALL * SCOPES.length - 1);
  assert.ok(claim.recheck.every((item) => item.reason === "other-build"));
  assert.ok(
    !claim.recheck.some((item) => item.criterion.id === "1.4.3" && item.scope === "checkout"),
  );

  const s = statement(claim, decided, asOf);
  assert.equal(s.status, "fully compliant");
  assert.deepEqual(s.nonAccessibleContent, []);
  assert.deepEqual(s.pending, []);

  const markdown = toMarkdown(s);
  assert.ok(markdown.includes("**fully compliant**"));
  assert.ok(
    markdown.includes("## Limits of this assessment"),
    "a compliant statement still has to carry what qualifies it",
  );

  // Without a build to assess against, the trail describes two products at once.
  assert.match(assess(evidence, { asOf }).reasons.join(" "), /spans 2 builds \(2026\.8\.0, 2026\.8\.1\)/);
});

test("stage 5: a new release turns the whole claim into a re-check list", () => {
  const claim = assess(fixed(), { asOf: shipped, build: NEW_BUILD });

  assert.equal(claim.status, "conformant", "stale evidence still says what somebody found");
  assert.equal(claim.recheck.length, ALL * SCOPES.length);
  assert.ok(claim.recheck.every((item) => item.reason === "other-build"));
  assert.match(claim.reasons.join(" "), /build other than 2026\.9\.0/);
});

test("stage 6: the re-audit finds a regression, and the statement follows it", () => {
  const claim = assess(regressed(), { asOf: shipped, build: NEW_BUILD });

  assert.equal(claim.status, "partially-conformant");
  assert.deepEqual(claim.stale, []);
  assert.deepEqual(claim.recheck, []);
  assert.deepEqual(
    claim.failed.map((result) => result.criterion.id),
    ["2.4.7"],
  );
  assert.equal(claim.results.find((r) => r.criterion.id === "2.4.7")!.status, "failed");
  assert.equal(
    claim.results.find((r) => r.criterion.id === "1.4.3")!.status,
    "satisfied",
    "the criterion fixed last release is not dragged back by its history",
  );

  const s = statement(claim, decided, shipped);

  assert.equal(s.status, "partially compliant");
  assert.deepEqual(
    s.nonAccessibleContent.map((item) => item.criterion),
    ["2.4.7"],
  );
  assert.deepEqual(s.nonAccessibleContent[0].failingScopes, ["checkout", "home"]);
  assert.equal(s.nonAccessibleContent[0].reason, FOCUS_NOTE);
  assert.deepEqual(
    s.pending.map((item) => item.id),
    ["alternative:2.4.7"],
  );

  const markdown = toMarkdown(s);
  assert.ok(markdown.includes("2.4.7 Focus Visible"));
  assert.ok(markdown.includes(FOCUS_NOTE));
  assert.ok(!markdown.includes("1.4.3"), "the fixed defect is no longer declared");
});

test("stage 7: the regression does not rewrite what held on the earlier build", () => {
  const evidence = regressed();

  assert.equal(evidence.for("2.4.7").length, 4);
  assert.deepEqual(evidence.builds, [FIRST_BUILD, FIX_BUILD, NEW_BUILD]);
  assert.deepEqual(
    evidence.latestPerScope("2.4.7", FIRST_BUILD).map((c) => [c.scope, c.outcome, c.checkedAt]),
    [
      ["checkout", "passed", GAP_CLOSED],
      ["home", "passed", AUDITED],
    ],
  );
});

test("the trail survives being stored between releases", () => {
  const evidence = regressed();
  const restored = Evidence.fromJSON(JSON.parse(JSON.stringify(evidence)));

  assert.deepEqual(
    statement(assess(restored, { asOf: shipped, build: NEW_BUILD }), decided, shipped),
    statement(assess(evidence, { asOf: shipped, build: NEW_BUILD }), decided, shipped),
  );
});
