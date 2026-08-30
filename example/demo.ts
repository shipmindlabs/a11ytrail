/**
 * A team audits two pages, publishes a statement, and finds out what their
 * evidence actually supports — and what it cannot decide for them.
 *
 *   npm run demo
 */

import {
  assess,
  AUTOMATABLE,
  criteriaFor,
  Evidence,
  statement,
  toMarkdown,
  UnsupportedClaim,
} from "../src/index.ts";
import type { Check } from "../src/index.ts";

const asOf = new Date("2026-08-16T00:00:00Z");

const evidence = new Evidence();
const record = (overrides: Partial<Check> & Pick<Check, "criterion" | "scope">) =>
  evidence.add({
    outcome: "passed",
    method: "manual",
    checkedAt: "2026-08-01",
    checkedBy: "audit team",
    ...overrides,
  });

// A CI scanner runs over both pages. It settles only the criteria a machine can
// decide — seven of the fifty-five, which is the whole reason the rest of this
// exists.
for (const criterion of criteriaFor("AA")) {
  if (!AUTOMATABLE.has(criterion.id)) continue;
  for (const scope of ["home", "checkout"]) {
    record({ criterion: criterion.id, scope, method: "automated", tool: "axe-core", checkedBy: "ci" });
  }
}

// A person then checks the two pages by hand, and finds one real problem.
for (const criterion of criteriaFor("AA")) {
  record({ criterion: criterion.id, scope: "home", checkedAt: "2026-08-05" });
  if (criterion.id !== "2.4.7") {
    record({
      criterion: criterion.id,
      scope: "checkout",
      checkedAt: "2026-08-05",
      outcome: criterion.id === "1.4.3" ? "failed" : "passed",
    });
  }
}

const claim = assess(evidence, { asOf });
console.log(`Claim: ${claim.status} at level ${claim.level}`);
for (const reason of claim.reasons) console.log(`  - ${reason}`);

console.log("\nWhat is missing:");
for (const result of claim.unevaluated) {
  console.log(
    `  ${result.criterion.id} ${result.criterion.name} — not checked on: ${result.unevaluatedScopes.join(", ")}`,
  );
}

console.log("\nTrying to publish the statement anyway:");
try {
  console.log(toMarkdown(statement(claim, organisation(), asOf)));
} catch (error) {
  if (!(error instanceof UnsupportedClaim)) throw error;
  console.log(`  refused — ${error.message}`);
}

// The team goes back and checks the missing criterion on checkout.
record({ criterion: "2.4.7", scope: "checkout", checkedAt: "2026-08-14" });

const finished = assess(evidence, { asOf });
console.log(`\nAfter closing the gap: ${finished.status}`);

const published = statement(finished, organisation(), asOf);
console.log(`\n${published.pending.length} parts still need a human decision:`);
for (const decision of published.pending) console.log(`  - ${decision.question}`);

console.log("\n" + toMarkdown(published));

function organisation() {
  return {
    name: "Example Ltd",
    service: "the Example web shop",
    feedbackContact: "accessibility@example.com",
    enforcementProcedure:
      "If we do not respond within 30 days, a complaint can be raised with the national enforcement body.",
    assessmentMethod: "self-assessment against recorded evidence",
  };
}
