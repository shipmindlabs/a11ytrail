import { strict as assert } from "node:assert";
import { test } from "node:test";

import { Evidence, InvalidCheck, type Check, type Method, type Outcome } from "../src/index.ts";

const check = (overrides: Partial<Check> = {}): Check => ({
  criterion: "1.4.3",
  outcome: "passed",
  method: "manual",
  checkedAt: "2026-08-05",
  checkedBy: "audit team",
  scope: "home",
  ...overrides,
});

test("a check records the criterion, the method, the actor and the date", () => {
  const evidence = new Evidence().add(
    check({ method: "assistive-technology", checkedBy: "J. Okonkwo, NVDA" }),
  );

  assert.deepEqual(evidence.checks, [
    {
      criterion: "1.4.3",
      outcome: "passed",
      method: "assistive-technology",
      checkedAt: "2026-08-05",
      checkedBy: "J. Okonkwo, NVDA",
      scope: "home",
    },
  ]);
});

test("a recorded check cannot be edited afterwards", () => {
  const evidence = new Evidence().add(check({ outcome: "failed" }));
  const recorded = evidence.checks[0];

  assert.throws(() => {
    (recorded as { outcome: Outcome }).outcome = "passed";
  }, TypeError);
  assert.equal(evidence.checks[0].outcome, "failed");
});

test("the recorded check is detached from the object handed in", () => {
  const submitted = { ...check(), note: "first pass" };
  const evidence = new Evidence().add(submitted);

  submitted.note = "rewritten later";

  assert.equal(evidence.checks[0].note, "first pass");
});

test("the list of checks cannot be used to remove one", () => {
  const evidence = new Evidence().add(check()).add(check({ scope: "checkout" }));

  assert.throws(() => (evidence.checks as Check[]).pop(), TypeError);
  assert.equal(evidence.checks.length, 2);
});

test("a correction is recorded as a later check, not as an edit", () => {
  const evidence = new Evidence()
    .add(check({ outcome: "failed", note: "contrast 3.1:1" }))
    .add(check({ checkedAt: "2026-08-14", note: "fixed" }));

  assert.equal(evidence.checks.length, 2);
  assert.deepEqual(
    evidence.latestPerScope("1.4.3").map((c) => [c.outcome, c.checkedAt]),
    [["passed", "2026-08-14"]],
  );
});

test("a later check on one scope does not speak for another", () => {
  const evidence = new Evidence()
    .add(check({ scope: "checkout", outcome: "failed" }))
    .add(check({ scope: "home", checkedAt: "2026-08-14" }));

  assert.deepEqual(
    evidence.latestPerScope("1.4.3").map((c) => [c.scope, c.outcome]),
    [
      ["checkout", "failed"],
      ["home", "passed"],
    ],
  );
  assert.deepEqual(evidence.scopes, ["checkout", "home"]);
});

test("evidence for a criterion that does not exist is refused", () => {
  assert.throws(() => new Evidence().add(check({ criterion: "9.9.9" })), InvalidCheck);
});

test("a check nobody performed, at no date, on nothing, is refused", () => {
  assert.throws(() => new Evidence().add(check({ checkedBy: "  " })), InvalidCheck);
  assert.throws(() => new Evidence().add(check({ checkedAt: "last tuesday" })), InvalidCheck);
  assert.throws(() => new Evidence().add(check({ scope: "" })), InvalidCheck);
});

test("an automated check must name the tool that produced it", () => {
  assert.throws(() => new Evidence().add(check({ method: "automated" })), InvalidCheck);

  const evidence = new Evidence().add(
    check({ method: "automated", tool: "axe-core 4.10", checkedBy: "ci" }),
  );
  assert.equal(evidence.checks[0].tool, "axe-core 4.10");
});

test("an unrecognised method or outcome is refused rather than stored", () => {
  assert.throws(() => new Evidence().add(check({ method: "a quick look" as Method })), InvalidCheck);
  assert.throws(() => new Evidence().add(check({ outcome: "mostly ok" as Outcome })), InvalidCheck);
});

test("evidence survives a JSON round trip, and is re-validated on the way in", () => {
  const evidence = new Evidence()
    .add(check())
    .add(check({ criterion: "2.4.7", scope: "checkout", outcome: "inconclusive" }));

  const restored = Evidence.fromJSON(JSON.parse(JSON.stringify(evidence)));

  assert.deepEqual(restored.checks, evidence.checks);
  assert.throws(
    () => Evidence.fromJSON([{ ...check(), checkedBy: "" }]),
    InvalidCheck,
  );
});
