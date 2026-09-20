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

5 parts still need a human decision:
  - Describe what a person runs into for 1.4.3 Contrast (Minimum).
  - Name the accessible alternative for 1.4.3 Contrast (Minimum), or say there is none.
  - State which content, if any, is exempt as a disproportionate burden.
  - State which content, if any, falls outside the scope of the legislation.
  - Give the date this statement was last reviewed.

Against build 2026.9.0: partially-conformant
  - 1 criteria are not satisfied across the covered scopes
  - 55 criteria rest on evidence from a build other than 2026.9.0, and need re-checking

110 checks to re-run, starting with:
  - 1.1.1 Non-text Content on checkout (last checked 2026-08-05 on 2026.8.1)
  - 1.1.1 Non-text Content on home (last checked 2026-08-05 on 2026.8.1)
```

## Evidence, not a scanner badge

A scanner decides what can be decided from the markup: the contrast ratio of a
text node against its background, a missing `lang`, a control with no accessible
name, an input with no label. That work is worth doing. It is cheap, it repeats
on every commit, and it finds real defects before anyone has to look.

What it cannot do is read meaning. Whether `alt="chart"` describes the chart,
whether tabbing through checkout follows the order a person reads it in, whether
"Error in field 3" tells anyone what to correct — a machine sees an attribute
that is present, an order that is defined, a message that is rendered, and calls
each of them satisfied. That is why the published estimates for automated
detection sit at roughly a quarter to a third of accessibility problems, and why
the criteria left over are not marginal ones: 1.1.1 Non-text Content, 2.4.3
Focus Order, 3.3.3 Error Suggestion.

So a tool having run is treated here as a fact about the check, not as an answer
to the criterion. Seven of the fifty-five criteria at A and AA are listed in
`AUTOMATABLE` as ones a scanner can settle on its own. A pass on anything else
with nothing but a scanner behind it is absent evidence wearing a green tick,
and it is reported as such.

### What it keeps instead

Every check carries what a badge throws away: the outcome, the method
(`automated`, `manual`, `assistive-technology`, `user-testing`), who ran it, the
date, the scope it covers, the build it was taken on, and the tool if one was
involved. An automated result without a named tool is refused, because nobody
can reproduce it.

From that, a claim can say what a percentage cannot:

```ts
const claim = assess(evidence, { level: "AA", build: "2026.9.0" });

claim.unconfirmed; // satisfied, but every check behind it came from a scanner
claim.overclaimed; // satisfied by a scanner alone on a criterion no scanner settles
claim.unevaluated; // nobody has looked, or nobody has looked everywhere
claim.recheck;     // evidence that describes another build, by criterion and scope
```

None of these turn a pass into a failure. They change what the claim is allowed
to say about it, which is the whole distinction between a record of testing and
a badge.

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
    build: "2026.8.1",
    note: "price text on the promo banner is 3.1:1",
  });

const claim = assess(evidence, { level: "AA", build: "2026.9.0" });
if (claim.recheck.length > 0) {
  // What the release you are about to ship has no evidence for, by criterion and scope.
}

const published = statement(claim, organisation, new Date());
if (published.pending.length > 0) {
  // The parts no record of tests can answer, listed rather than guessed.
}
console.log(toMarkdown(published));
```

## The five things it refuses to do

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

**It will not let a scanner speak for a person.** A pass with only a tool behind
it comes back as `unconfirmed`, and on a criterion no tool can settle it is
`overclaimed` as well — the two being different sizes of the same problem.

**It will not let evidence age silently.** Every check carries its date and the
build it was taken on. A page audited before four redesigns supports nothing,
and a pass from two releases ago says nothing about what ships today — so stale
evidence appears in the claim's caveats and in the published statement, with
what to re-run named by criterion and scope. Naming the build under assessment
also decides which check speaks for it: the one taken on that build, not merely
the most recent one.

**It will not write the parts that are a judgement.** Whether an exemption is a
disproportionate burden, what alternative a user is offered, what a failing
criterion means for the person in front of it — none of that follows from a
record of tests. Those parts come back as `pending` and are marked in the
Markdown, because a plausible sentence there reads as answered.

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
| Evidence | outcome, method, date, who, scope, tool, build; later checks supersede earlier ones per scope |
| Claim | per-criterion status, coverage gaps, staleness by age and by build, the re-check list, scanner-only passes |
| Statement | European model statement as data and as Markdown, with the human decisions marked instead of filled |
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

MIT © Shipmind Labs (https://shipmindlabs.com)
