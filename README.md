# a11ytrail

The evidence layer under an accessibility claim.

Automated accessibility tools settle roughly a quarter to a third of WCAG. The
rest is judgement: whether alt text describes the picture, whether the focus
order makes sense, whether an error message tells anyone what to do. So the
question that decides an audit is not "did the scanner pass" — it is **what was
checked, by whom, when, and what does that let you say.**

That is what this keeps, and it is the part that most often does not exist when
a regulator asks.

```console
$ npm run demo
Claim: incomplete at level AA
  - 1 of 55 criteria have no conclusive evidence, so conformance cannot be claimed

What is missing:
  2.4.7 Focus Visible — not checked on: checkout

Trying to publish the statement anyway:
  refused — the evidence does not support any compliance status yet: criteria remain
  unevaluated. Finish the assessment, or publish a statement that says the assessment
  is under way.

After closing the gap: partially-conformant
```

## Use

```ts
import { assess, Evidence, statement, toMarkdown } from "a11ytrail";

const evidence = new Evidence()
  .add({
    criterion: "1.4.3",
    outcome: "failed",
    method: "manual",
    checkedAt: "2026-08-05",
    checkedBy: "audit team",
    scope: "checkout",
    note: "price text on the promo banner is 3.1:1",
  });

const claim = assess(evidence, { level: "AA" });
console.log(toMarkdown(statement(claim, organisation, new Date())));
```

## The four things it refuses to do

**It will not treat an unevaluated criterion as a pass.** WCAG's conformance
requirement gives no partial credit: a claim at a level means every criterion at
that level is satisfied. One criterion nobody has looked at makes the claim
`incomplete`, and `incomplete` is not one of the statuses an accessibility
statement can carry — so building the statement throws instead of quietly
publishing "partially compliant".

**It will not confuse a gap with a defect.** A criterion that passes on the home
page and was never checked on checkout is not a failure. Reporting it as one
sends a developer to fix code that may be fine; the real answer is that nobody
looked at that page.

**It will not let a scanner speak for a person.** A pass recorded by a tool
alone is flagged; a pass recorded by a tool alone *on a criterion no tool can
settle* — 1.1.1 Non-text Content, say — is called out separately. That is not
weak evidence, it is absent evidence wearing a green tick.

**It will not let evidence age silently.** Every check carries its date. A page
audited before four redesigns supports nothing, so stale evidence appears in the
claim's caveats and in the published statement.

## What it does not do

**It runs no tests.** axe-core, Playwright and a person with a screen reader do
that. This consumes what they produce. Building a fifth rule engine would add
nothing, and the gap in this field is not detection — it is the record.

**It is not legal advice.** It builds the European model accessibility statement
out of your own evidence. Whether that satisfies a particular national
implementation of the EAA is a question for someone qualified to answer it.

## Status

Early. What is here works end to end; the rest is listed rather than implied.

| | |
|---|---|
| Criteria | WCAG 2.2, levels A and AA — 55 success criteria |
| Evidence | outcome, method, date, who, scope, tool; later checks supersede earlier ones per scope |
| Claim | per-criterion status, coverage gaps, staleness, scanner-only passes |
| Statement | European model statement as data and as Markdown |
| Not yet | EN 301 549 clause mapping beyond WCAG, VPAT/ACR export, importing axe-core results directly, non-web software criteria |

Level AAA is deliberately absent: nobody claims it for a whole product, and
offering it would invite a claim nobody can keep.

## Install

Node 22.18 or newer, which runs the TypeScript sources directly. No runtime
dependencies.

```bash
npm install a11ytrail
```

## Development

```bash
npm test        # node --test, no dependencies needed
npm run demo    # the transcript above
npm run typecheck   # needs: npm i -D typescript
```

## License

MIT
