import { test } from "node:test";
import assert from "node:assert/strict";

import { criteriaFor } from "../src/criteria.ts";
import { assess } from "../src/conformance.ts";
import { Evidence, type Check } from "../src/evidence.ts";
import { statement, toMarkdown, UnsupportedClaim, type Organisation } from "../src/statement.ts";

const asOf = new Date("2026-08-16T00:00:00Z");

const organisation: Organisation = {
  name: "Example Ltd",
  service: "the Example web shop",
  feedbackContact: "accessibility@example.com",
  enforcementProcedure: "Complaints go to the national enforcement body.",
  assessmentMethod: "self-assessment against recorded evidence",
};

function evidenceWith(overrides: Partial<Check> = {}, failing: string[] = []): Evidence {
  const evidence = new Evidence();
  for (const criterion of criteriaFor("AA")) {
    evidence.add({
      criterion: criterion.id,
      outcome: failing.includes(criterion.id) ? "failed" : "passed",
      method: "manual",
      checkedAt: "2026-08-01",
      checkedBy: "auditor",
      scope: "home",
      ...overrides,
    });
  }
  return evidence;
}

test("a full pass produces a fully compliant statement", () => {
  const s = statement(assess(evidenceWith(), { asOf }), organisation, asOf);
  assert.equal(s.status, "fully compliant");
  assert.equal(s.preparedOn, "2026-08-16");
  assert.deepEqual(s.nonAccessibleContent, []);
});

test("failures are listed as non-accessible content, by name", () => {
  const claim = assess(evidenceWith({}, ["1.4.3", "2.1.1"]), { asOf });
  const s = statement(claim, organisation, asOf);

  assert.equal(s.status, "partially compliant");
  assert.equal(s.nonAccessibleContent.length, 2);
  assert.match(s.nonAccessibleContent.join(" "), /1\.4\.3 Contrast \(Minimum\)/);
  assert.match(s.nonAccessibleContent.join(" "), /2\.1\.1 Keyboard/);
});

// The refusal that matters. There is no honest way to render "we have not
// finished looking" as one of the three statuses the model statement allows.
test("an incomplete assessment cannot be published as a compliance status", () => {
  const partial = new Evidence(evidenceWith().checks.filter((c) => c.criterion !== "2.4.7"));
  const claim = assess(partial, { asOf });

  assert.throws(() => statement(claim, organisation, asOf), UnsupportedClaim);
  try {
    statement(claim, organisation, asOf);
  } catch (error) {
    assert.match((error as Error).message, /Finish the assessment/);
  }
});

test("the caveats travel into the statement rather than being dropped", () => {
  const claim = assess(evidenceWith({ checkedAt: "2020-01-01" }), { asOf });
  const s = statement(claim, organisation, asOf);
  assert.ok(s.caveats.some((caveat) => /older than 365 days/.test(caveat)));
});

test("the markdown carries every section a reader needs", () => {
  const claim = assess(evidenceWith({}, ["1.4.3"]), { asOf });
  const markdown = toMarkdown(statement(claim, organisation, asOf));

  for (const section of [
    "# Accessibility statement",
    "## Compliance status",
    "## Non-accessible content",
    "## Limits of this assessment",
    "## Preparation of this statement",
    "## Feedback and contact information",
    "## Enforcement procedure",
  ]) {
    assert.ok(markdown.includes(section), `missing section: ${section}`);
  }
  assert.ok(markdown.includes("accessibility@example.com"));
  assert.ok(markdown.includes("**partially compliant**"));
});

test("a statement with nothing to declare omits the empty sections", () => {
  const markdown = toMarkdown(statement(assess(evidenceWith(), { asOf }), organisation, asOf));
  assert.ok(!markdown.includes("## Non-accessible content"));
  assert.ok(markdown.includes("**fully compliant**"));
});
