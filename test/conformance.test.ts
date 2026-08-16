import { test } from "node:test";
import assert from "node:assert/strict";

import { criteriaFor } from "../src/criteria.ts";
import { assess } from "../src/conformance.ts";
import { Evidence, InvalidCheck, type Check } from "../src/evidence.ts";

const asOf = new Date("2026-08-16T00:00:00Z");

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

/** Evidence that passes every criterion at level AA, on one scope. */
function fullPass(scope = "home", checkedAt = "2026-08-01"): Evidence {
  const evidence = new Evidence();
  for (const criterion of criteriaFor("AA")) {
    evidence.add(check({ criterion: criterion.id, scope, checkedAt }));
  }
  return evidence;
}

test("a complete pass is conformant", () => {
  const claim = assess(fullPass(), { asOf });
  assert.equal(claim.status, "conformant");
  assert.equal(claim.failed.length, 0);
  assert.equal(claim.unevaluated.length, 0);
});

// The rule the whole module exists to enforce: WCAG gives no partial credit,
// so an unevaluated criterion blocks the claim rather than being assumed fine.
test("one unevaluated criterion makes the claim incomplete, not conformant", () => {
  const withGap = new Evidence(fullPass().checks.filter((c) => c.criterion !== "2.4.7"));

  const claim = assess(withGap, { asOf });
  assert.equal(claim.status, "incomplete");
  assert.equal(claim.unevaluated.length, 1);
  assert.equal(claim.unevaluated[0].criterion.id, "2.4.7");
  assert.match(claim.reasons[0], /cannot be claimed/);
});

test("a failure makes the claim partially conformant", () => {
  const evidence = new Evidence(
    fullPass().checks.map((c) =>
      c.criterion === "1.4.3" ? { ...c, outcome: "failed" as const } : c,
    ),
  );
  const claim = assess(evidence, { asOf });

  assert.equal(claim.status, "partially-conformant");
  assert.deepEqual(
    claim.failed.map((f) => f.criterion.id),
    ["1.4.3"],
  );
});

// A gap in coverage is not a defect. Reporting it as one sends someone to fix
// code that may be fine, when the real answer is that nobody looked.
test("a criterion checked on one page and not another is incomplete, not failed", () => {
  const evidence = fullPass("home");
  for (const criterion of criteriaFor("AA")) {
    if (criterion.id !== "1.4.3") {
      evidence.add(check({ criterion: criterion.id, scope: "checkout" }));
    }
  }

  const claim = assess(evidence, { asOf });
  const result = claim.results.find((r) => r.criterion.id === "1.4.3")!;

  assert.equal(result.status, "not-evaluated");
  assert.deepEqual(result.unevaluatedScopes, ["checkout"]);
  assert.equal(claim.failed.length, 0, "a coverage gap must not be reported as a failure");
  assert.equal(claim.status, "incomplete");
});

test("a failure on one page is not rescued by a pass on another", () => {
  const evidence = fullPass("home");
  for (const criterion of criteriaFor("AA")) {
    evidence.add(
      check({
        criterion: criterion.id,
        scope: "checkout",
        outcome: criterion.id === "2.1.1" ? "failed" : "passed",
      }),
    );
  }

  const claim = assess(evidence, { asOf });
  assert.equal(claim.results.find((r) => r.criterion.id === "2.1.1")!.status, "partial");
  assert.equal(claim.status, "partially-conformant");
});

test("not-applicable satisfies a criterion without pretending it was tested", () => {
  const evidence = new Evidence(
    fullPass().checks.map((c) =>
      c.criterion === "1.2.4"
        ? { ...c, outcome: "not-applicable" as const, note: "no live audio" }
        : c,
    ),
  );
  const claim = assess(evidence, { asOf });

  assert.equal(claim.status, "conformant");
  assert.equal(claim.results.find((r) => r.criterion.id === "1.2.4")!.status, "not-applicable");
});

test("an inconclusive check never counts as a pass", () => {
  const evidence = new Evidence(
    fullPass().checks.map((c) =>
      c.criterion === "1.3.1" ? { ...c, outcome: "inconclusive" as const } : c,
    ),
  );
  const claim = assess(evidence, { asOf });

  assert.equal(claim.status, "incomplete");
  assert.equal(claim.results.find((r) => r.criterion.id === "1.3.1")!.status, "inconclusive");
});

test("a later check supersedes an earlier one for the same scope", () => {
  const evidence = fullPass();
  evidence.add(check({ criterion: "1.4.3", outcome: "failed", checkedAt: "2026-07-01" }));
  // That failure predates the pass recorded by fullPass on 2026-08-01.
  assert.equal(assess(evidence, { asOf }).status, "conformant");

  evidence.add(check({ criterion: "1.4.3", outcome: "failed", checkedAt: "2026-08-10" }));
  assert.equal(assess(evidence, { asOf }).status, "partially-conformant");
});

test("evidence that has aged out is reported without silently voiding the claim", () => {
  const claim = assess(fullPass("home", "2024-01-01"), { asOf, staleAfterDays: 365 });
  assert.equal(claim.status, "conformant");
  assert.ok(claim.stale.length > 0);
  assert.match(claim.reasons.join(" "), /older than 365 days/);
});

// A scanner passing "images have alt text" says nothing about whether the alt
// text means anything.
test("a scanner-only pass on a criterion no scanner can settle is called out", () => {
  const evidence = new Evidence();
  for (const criterion of criteriaFor("AA")) {
    evidence.add(
      check({ criterion: criterion.id, method: "automated", tool: "axe-core", checkedBy: "ci" }),
    );
  }

  const claim = assess(evidence, { asOf });
  assert.equal(claim.status, "conformant");
  assert.ok(claim.unconfirmed.length > 40, "most criteria rest on a scanner alone");
  assert.ok(
    claim.overclaimed.some((r) => r.criterion.id === "1.1.1"),
    "1.1.1 cannot be settled by a scanner and must be flagged",
  );
  assert.match(claim.reasons.join(" "), /no scanner can settle them/);
});

test("no evidence at all is incomplete, and says so plainly", () => {
  const claim = assess(new Evidence(), { asOf });
  assert.equal(claim.status, "incomplete");
  assert.deepEqual(claim.reasons, ["no evidence has been recorded"]);
});

test("level A claims cover fewer criteria than level AA", () => {
  const a = assess(fullPass(), { asOf, level: "A" }).results.length;
  const aa = assess(fullPass(), { asOf, level: "AA" }).results.length;
  assert.ok(a < aa);
  assert.equal(aa, criteriaFor("AA").length);
});

test("evidence refuses what cannot support a claim", () => {
  const evidence = new Evidence();
  assert.throws(() => evidence.add(check({ criterion: "9.9.9" })), InvalidCheck);
  assert.throws(() => evidence.add(check({ criterion: "1.1.1", checkedBy: " " })), InvalidCheck);
  assert.throws(
    () => evidence.add(check({ criterion: "1.1.1", checkedAt: "whenever" })),
    InvalidCheck,
  );
  assert.throws(() => evidence.add(check({ criterion: "1.1.1", scope: "" })), InvalidCheck);
  // An automated result nobody can reproduce is not evidence.
  assert.throws(
    () => evidence.add(check({ criterion: "1.1.1", method: "automated" })),
    InvalidCheck,
  );
});

test("evidence survives a round trip through JSON", () => {
  const evidence = fullPass();
  const restored = Evidence.fromJSON(JSON.parse(JSON.stringify(evidence)));
  assert.deepEqual(restored.checks, evidence.checks);
});
