/**
 * The criteria registry, checked against the standard it transcribes.
 *
 * Every id, title, level and version pinned below is taken from the W3C
 * Recommendation "Web Content Accessibility Guidelines (WCAG) 2.2"
 * (https://www.w3.org/TR/WCAG22/), levels A and AA, and from nowhere else.
 * These assertions are deliberately literal: a conformance claim is made of
 * criteria, so an entry that is renumbered, renamed or re-versioned by hand is
 * a claim about a standard that does not exist, and that is the kind of error
 * nothing downstream can detect.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { AUTOMATABLE, CRITERIA, criteriaFor, criterion } from "../src/criteria.ts";

/** 1.4.5 comes before 1.4.10: the parts are numbers, not text. */
function byNumber(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let part = 0; part < 3; part++) {
    if (left[part] !== right[part]) return left[part] - right[part];
  }
  return 0;
}

const ids = CRITERIA.map((entry) => entry.id);

/** Added in WCAG 2.2, levels A and AA. */
const SINCE_2_2 = ["2.4.11", "2.5.7", "2.5.8", "3.2.6", "3.3.7", "3.3.8"];

/** Added in WCAG 2.1, levels A and AA. */
const SINCE_2_1 = [
  "1.3.4",
  "1.3.5",
  "1.4.10",
  "1.4.11",
  "1.4.12",
  "1.4.13",
  "2.1.4",
  "2.5.1",
  "2.5.2",
  "2.5.3",
  "2.5.4",
  "4.1.3",
];

test("the table holds the 55 criteria WCAG 2.2 publishes at A and AA, each once", () => {
  assert.equal(CRITERIA.length, 55);
  assert.equal(new Set(ids).size, 55, "an id listed twice would be counted twice in a claim");
  assert.ok(
    CRITERIA.every((entry) => entry.level === "A" || entry.level === "AA"),
    "level AAA is not part of the catalogue",
  );
  assert.ok(CRITERIA.every((entry) => entry.name.trim().length > 0));
});

// fromScanner sorts imported checks by the position of each id in this table,
// so the table's order is what a report reads in.
test("the ids are in numeric document order, not in text order", () => {
  assert.deepEqual(ids, [...ids].sort(byNumber));
  assert.ok(
    ids.indexOf("1.4.5") < ids.indexOf("1.4.10"),
    "1.4.10 sorts after 1.4.5 by number, and before it as text",
  );
  assert.ok(ids.indexOf("2.4.7") < ids.indexOf("2.4.11"));
});

test("a claim at AA covers every criterion; a claim at A covers the 31 at that level", () => {
  const a = criteriaFor("A");
  assert.equal(a.length, 31);
  assert.ok(a.every((entry) => entry.level === "A"));

  assert.deepEqual(criteriaFor("AA"), CRITERIA, "AA includes A");
  assert.equal(criteriaFor("AA").length, 55);
});

// The pairs people reach for from memory and get wrong.
test("the criteria that are mixed up are pinned to their published values", () => {
  assert.deepEqual(criterion("2.4.7"), {
    id: "2.4.7",
    name: "Focus Visible",
    level: "AA",
    since: "2.0",
  });
  assert.deepEqual(criterion("2.4.11"), {
    id: "2.4.11",
    name: "Focus Not Obscured (Minimum)",
    level: "AA",
    since: "2.2",
  });
  assert.deepEqual(criterion("1.4.3"), {
    id: "1.4.3",
    name: "Contrast (Minimum)",
    level: "AA",
    since: "2.0",
  });
  assert.deepEqual(criterion("3.2.6"), {
    id: "3.2.6",
    name: "Consistent Help",
    level: "A",
    since: "2.2",
  });

  // Obsolete and removed in WCAG 2.2, so a 2.2 claim is not made of it.
  assert.equal(criterion("4.1.1"), undefined);
  assert.equal(criterion("1.4.6"), undefined, "1.4.6 Contrast (Enhanced) is AAA");
  assert.equal(criterion("9.9.9"), undefined);
});

test("each criterion records the WCAG version it came in with", () => {
  assert.deepEqual(
    ids.filter((id) => criterion(id)!.since === "2.2"),
    SINCE_2_2,
  );
  assert.deepEqual(
    ids.filter((id) => criterion(id)!.since === "2.1"),
    SINCE_2_1,
  );

  const inherited = ids.filter((id) => !SINCE_2_2.includes(id) && !SINCE_2_1.includes(id));
  assert.equal(inherited.length, 37);
  assert.ok(inherited.every((id) => criterion(id)!.since === "2.0"));
});

test("every criterion a scanner is trusted to settle exists in the table", () => {
  assert.equal(AUTOMATABLE.size, 7);
  for (const id of AUTOMATABLE) {
    assert.ok(criterion(id), `AUTOMATABLE names ${id}, which is not a criterion`);
  }
});
