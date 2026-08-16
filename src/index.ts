/**
 * a11ytrail — the evidence layer under an accessibility claim: what was
 * checked, by whom, when, and what that does and does not let you say.
 *
 * It runs no accessibility tests. Scanners do that well, and this consumes what
 * they and your testers produce. See README.md.
 */

export {
  AUTOMATABLE,
  CRITERIA,
  criteriaFor,
  criterion,
  type Criterion,
  type Level,
} from "./criteria.ts";

export {
  Evidence,
  InvalidCheck,
  type Check,
  type Method,
  type Outcome,
} from "./evidence.ts";

export {
  assess,
  type AssessOptions,
  type Claim,
  type ClaimStatus,
  type CriterionResult,
  type CriterionStatus,
} from "./conformance.ts";

export {
  statement,
  toMarkdown,
  UnsupportedClaim,
  type ComplianceStatus,
  type Organisation,
  type Statement,
} from "./statement.ts";
