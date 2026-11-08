import { test } from "node:test";
import assert from "node:assert/strict";

import { criteriaFor } from "../src/criteria.ts";
import { assess } from "../src/conformance.ts";
import { Evidence, type Check } from "../src/evidence.ts";
import {
  statement,
  toMarkdown,
  UnsupportedClaim,
  type Organisation,
  type Pending,
} from "../src/statement.ts";

const asOf = new Date("2026-08-16T00:00:00Z");

/** What the renderer puts where a decision is missing. */
const MARKER = "**[needs a human decision]**";

/** An organisation that has not yet answered the questions only it can answer. */
const organisation: Organisation = {
  name: "Example Ltd",
  service: "the Example web shop",
  feedbackContact: "accessibility@example.com",
  enforcementProcedure: "Complaints go to the national enforcement body.",
  assessmentMethod: "self-assessment against recorded evidence",
};

/** The same organisation, with every judgement made. */
const decided: Organisation = {
  ...organisation,
  lastReviewedOn: "2026-08-16",
  disproportionateBurden: [],
  outOfScope: [],
};

/** The same organisation before anybody sat down with the statement. */
const nothingAnswered: Organisation = {
  name: organisation.name,
  service: organisation.service,
  feedbackContact: organisation.feedbackContact,
  enforcementProcedure: organisation.enforcementProcedure,
};

function evidenceWith(
  overrides: Partial<Check> = {},
  failing: readonly string[] = [],
  notes: Record<string, string> = {},
): Evidence {
  const evidence = new Evidence();
  for (const criterion of criteriaFor("AA")) {
    evidence.add({
      criterion: criterion.id,
      outcome: failing.includes(criterion.id) ? "failed" : "passed",
      method: "manual",
      checkedAt: "2026-08-01",
      checkedBy: "auditor",
      scope: "home",
      ...(notes[criterion.id] ? { note: notes[criterion.id] } : {}),
      ...overrides,
    });
  }
  return evidence;
}

function markerCount(markdown: string): number {
  return markdown.split(MARKER).length - 1;
}

function linesMarking(markdown: string, decision: Pending): readonly string[] {
  return markdown
    .split("\n")
    .filter((line) => line.includes(MARKER) && line.includes(decision.question));
}

test("a full pass produces a fully compliant statement", () => {
  const s = statement(assess(evidenceWith(), { asOf }), decided, asOf);
  assert.equal(s.status, "fully compliant");
  assert.equal(s.preparedOn, "2026-08-16");
  assert.deepEqual(s.nonAccessibleContent, []);
  assert.deepEqual(s.pending, []);
});

test("failures are listed as non-accessible content, with the recorded reason", () => {
  const claim = assess(
    evidenceWith({}, ["1.4.3", "2.1.1"], { "1.4.3": "promo banner price text is 3.1:1" }),
    { asOf },
  );
  const s = statement(claim, decided, asOf);

  assert.equal(s.status, "partially compliant");
  assert.equal(s.nonAccessibleContent.length, 2);

  const contrast = s.nonAccessibleContent.find((item) => item.criterion === "1.4.3");
  assert.equal(contrast?.name, "Contrast (Minimum)");
  assert.equal(contrast?.level, "AA");
  assert.deepEqual(contrast?.failingScopes, ["home"]);
  assert.equal(contrast?.reason, "promo banner price text is 3.1:1");
  assert.ok(!s.pending.some((item) => item.id === "reason:1.4.3"));
});

// The point of the module: a criterion number is not a description of a
// barrier, and inventing one would be worse than leaving it open.
test("a failure with no recorded reason is marked, not written for the organisation", () => {
  const s = statement(assess(evidenceWith({}, ["2.1.1"]), { asOf }), decided, asOf);

  assert.equal(s.nonAccessibleContent[0].reason, undefined);
  assert.deepEqual(
    s.pending.map((item) => item.id),
    ["reason:2.1.1", "alternative:2.1.1"],
  );

  const markdown = toMarkdown(s);
  assert.ok(markdown.includes("needs a human decision"));
  assert.ok(markdown.includes("Describe what a person runs into for 2.1.1 Keyboard."));
  assert.ok(markdown.includes("Draft: 2 part(s) of this statement need a human decision"));
});

test("an alternative the organisation supplies replaces the marker", () => {
  const claim = assess(evidenceWith({}, ["2.1.1"], { "2.1.1": "the date picker is mouse-only" }), {
    asOf,
  });
  const s = statement(
    claim,
    { ...decided, alternatives: { "2.1.1": "the date can be typed into the field next to it" } },
    asOf,
  );

  assert.deepEqual(s.pending, []);
  const markdown = toMarkdown(s);
  assert.ok(markdown.includes("the date can be typed into the field next to it"));
  assert.ok(!markdown.includes("needs a human decision"));
});

test("exemptions are asked for when absent and taken at face value when declared", () => {
  const claim = assess(evidenceWith(), { asOf });

  const open = statement(claim, organisation, asOf);
  assert.deepEqual(
    open.pending.map((item) => item.id),
    ["disproportionate-burden", "out-of-scope", "last-review"],
  );

  const declared = statement(
    claim,
    { ...decided, disproportionateBurden: ["the archived 2019 annual report PDFs"] },
    asOf,
  );
  assert.deepEqual(declared.pending, []);
  const markdown = toMarkdown(declared);
  assert.ok(markdown.includes("### Disproportionate burden"));
  assert.ok(markdown.includes("the archived 2019 annual report PDFs"));
  assert.ok(!markdown.includes("### Content outside the scope of the legislation"));
});

// Every kind of open decision at once, because the failure mode is a marker
// rendered twice or not at all: a reader works through the marks, and a count
// in the banner that does not match them is worse than no count.
test("every kind of open decision is marked exactly once, and the banner counts them", () => {
  const s = statement(assess(evidenceWith({}, ["2.1.1"]), { asOf }), nothingAnswered, asOf);

  assert.deepEqual(
    s.pending.map((item) => item.id),
    [
      "reason:2.1.1",
      "alternative:2.1.1",
      "disproportionate-burden",
      "out-of-scope",
      "assessment-method",
      "last-review",
    ],
  );

  const markdown = toMarkdown(s);

  for (const decision of s.pending) {
    const marked = linesMarking(markdown, decision);
    assert.equal(marked.length, 1, `${decision.id} is marked ${marked.length} times, not once`);
    assert.ok(
      marked[0].includes(decision.because),
      `${decision.id} is marked without saying why the record cannot answer it`,
    );
  }

  assert.ok(markdown.includes("Draft: 6 part(s) of this statement need a human decision"));
  // The banner names the marker once itself, to say what to look for below.
  assert.equal(markerCount(markdown), s.pending.length + 1);
});

test("a statement with every answer given carries no marker, no banner, no empty heading", () => {
  const claim = assess(evidenceWith({}, ["2.1.1"], { "2.1.1": "the date picker is mouse-only" }), {
    asOf,
  });
  const s = statement(
    claim,
    { ...decided, alternatives: { "2.1.1": "the date can be typed into the field next to it" } },
    asOf,
  );

  assert.deepEqual(s.pending, []);

  const markdown = toMarkdown(s);

  assert.equal(markerCount(markdown), 0);
  assert.ok(!markdown.includes("Draft:"));
  // An empty list says the question was considered and nothing is claimed,
  // which needs no heading of its own.
  assert.ok(!markdown.includes("### Disproportionate burden"));
  assert.ok(!markdown.includes("### Content outside the scope of the legislation"));
  assert.ok(
    markdown.includes("### Non-compliance with the accessibility requirements"),
    "the declared failure is still there",
  );
  assert.ok(markdown.includes("the date picker is mouse-only"));
});

// Blank is not an answer, so the decision stays open — but what the
// organisation handed over is printed as given rather than quietly replaced,
// so the published line shows the blank it supplied.
test("a method that is only whitespace stays pending, and is printed as it was given", () => {
  const blank = "   ";
  const s = statement(
    assess(evidenceWith(), { asOf }),
    { ...decided, assessmentMethod: blank },
    asOf,
  );

  assert.deepEqual(
    s.pending.map((item) => item.id),
    ["assessment-method"],
  );

  const markdown = toMarkdown(s);

  assert.ok(markdown.includes(`Assessment method: ${blank}.`));
  assert.deepEqual(linesMarking(markdown, s.pending[0]), []);
  assert.ok(markdown.includes("Draft: 1 part(s) of this statement need a human decision"));
  assert.equal(markerCount(markdown), 1, "the banner, and nothing marked in the body");
});

// The refusal that matters. There is no honest way to render "we have not
// finished looking" as one of the three statuses the model statement allows.
test("an incomplete assessment cannot be published as a compliance status", () => {
  const partial = new Evidence(evidenceWith().checks.filter((c) => c.criterion !== "2.4.7"));
  const claim = assess(partial, { asOf });

  assert.throws(() => statement(claim, decided, asOf), UnsupportedClaim);
  try {
    statement(claim, decided, asOf);
  } catch (error) {
    assert.match((error as Error).message, /Finish the assessment/);
  }
});

test("the caveats travel into the statement rather than being dropped", () => {
  const claim = assess(evidenceWith({ checkedAt: "2020-01-01" }), { asOf });
  const s = statement(claim, decided, asOf);
  assert.ok(s.caveats.some((caveat) => /older than 365 days/.test(caveat)));
});

test("the markdown carries every section a reader needs", () => {
  const claim = assess(evidenceWith({}, ["1.4.3"], { "1.4.3": "contrast 3.1:1" }), { asOf });
  const markdown = toMarkdown(statement(claim, decided, asOf));

  for (const section of [
    "# Accessibility statement",
    "## Compliance status",
    "## Non-accessible content",
    "### Non-compliance with the accessibility requirements",
    "## Limits of this assessment",
    "## Preparation of this statement",
    "## Feedback and contact information",
    "## Enforcement procedure",
  ]) {
    assert.ok(markdown.includes(section), `missing section: ${section}`);
  }
  assert.ok(markdown.includes("accessibility@example.com"));
  assert.ok(markdown.includes("**partially compliant**"));
  assert.ok(markdown.includes("Last reviewed on: 2026-08-16."));
});

test("a statement with nothing to declare omits the empty sections", () => {
  const markdown = toMarkdown(statement(assess(evidenceWith(), { asOf }), decided, asOf));
  assert.ok(!markdown.includes("## Non-accessible content"));
  assert.ok(!markdown.includes("Draft:"));
  assert.ok(markdown.includes("**fully compliant**"));
});
