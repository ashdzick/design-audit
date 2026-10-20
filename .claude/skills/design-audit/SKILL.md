---
name: design-audit
description: Audit a web page for design quality and hand back a ranked report with a confidence level on every finding. Rule-based accessibility checks (axe-core, WCAG 2.2 A/AA and best practice), plus judgment checks that Claude runs several times independently, with confidence measured as the share of runs that agree. Use when someone says "audit this page", "design audit <url or file>", "run an accessibility audit", "check this screen for accessibility", or gives a URL or local HTML file and asks what's wrong with it.
---

# Design Audit

Audits one page and writes an HTML report: findings ranked by impact, a
confidence meter on each, and a review threshold slider that decides what
goes straight to "Fix these" and what goes to a person.

## Before running

- Audit only pages the person owns or is allowed to test: their own sites,
  local files, staging they work on, or the fixtures in this repo. Never
  run it against another company's live product on someone's behalf.
- Needs Google Chrome installed (it drives the installed Chrome; no browser
  download) and `npm install` run once in this repo.

## Run

Before starting, ask the person two things in one message, with the
defaults picked so a plain "go" accepts both:
- **Review threshold** (default 90%): what confidence a finding needs to
  go straight to Fix.
- **Judgment runs** (default 3): how many independent judges answer each
  judgment check. Say in one line: more runs give finer confidence (3 runs:
  67% or 100%; 5 runs: 60, 80 or 100%) and cost more. One run means no
  agreement to measure, so nothing judged goes to Review on its own.

```bash
node scripts/audit.mjs <url-or-path> --threshold 90 --runs 3
```

- `<url-or-path>`: an http(s) URL, a file:// URL, or a path to a local HTML file.
- `--threshold`: 50 to 100, the person's review threshold. Default 90. Ask
  the person if they have a preference; otherwise use the default and say so.
- Output goes to `reports/<page>-<time>/`: `report.html`, `findings.json`,
  `screenshot.png`. The CLI prints a summary and the report path.

## Judgment checks

The audit writes one brief per judgment check in `<report>/judge/`
(`color-only.md`: meaning shown by color alone; `placeholder-label.md`: a
field whose only label is its placeholder; `contrast-<reason>.md`: a
second look at text whose contrast the rule couldn't measure, one brief per
reason, with a 2x close-up of each piece in `judge/crops/`;
`suggest-reason.md`: whether low-contrast text is part of a picture or
decoration, which makes no finding but suggests "Decorative" on that element
for a person to confirm; `suggest-alt.md`: for an image with no alt text,
whether it's decorative (fix: alt="") or what its alt text should say). A check with
nothing to judge
on the page gets no brief. Rules can't decide these; Claude judges them
from the screenshot and, where the brief gives it, the element's own code.

1. For each brief, start the number of runs the person picked as
   subagents, **all at once and independent**: each one gets the brief's
   path and its own number, reads the brief and the screenshot, and writes
   `<check>.run-<n>.json`. Tell each one not to read other run files.
   Confidence only means something if the judges can't see each other.
2. Don't judge the brief yourself and don't edit run files.
3. When all runs are in:
   ```bash
   node scripts/add-judgments.mjs <report folder>
   ```
   It merges the runs (verdict by majority, confidence = the share that
   agree) and rewrites the report with the judged findings ranked in.

## After running

1. Open the report for the person (`open <path>/report.html` on macOS).
2. In chat, give the top fixes from the CLI summary in one short list, and
   name anything in "A person reviews" with why it is there (the rule could
   not decide, or the finding is below the threshold).
3. Do not add findings of your own or re-judge any result. Rule-based
   results are deterministic, and judged ones carry the confidence the runs
   measured: the report is the answer. For a judged finding, say how many
   runs agreed ("2 of 3 judges").
4. Never mark an element not an issue on the person's behalf, even when
   the report suggests a reason at 3 of 3. A suggestion only pre-picks the
   reason; the person confirms each element in the report (D32).

## Confidence, in brief

- Rule-based fail or pass: 100%.
- Rule cannot decide (axe "incomplete"): no number; always goes to a person.
- Judgment calls: measured, not stated. The same check runs several times
  (default 3) and confidence is the share of runs that agree.
- The threshold is the person's call. Anything below it, pass or fail, goes
  to a person; a low-confidence pass may be a miss.

## Demo page

`fixtures/lead-view/index.html` is a synthetic dealership CRM lead view with
planted issues listed in `fixtures/lead-view/planted.json`. Two of them (color-only
lead temperature dots, placeholder as the only label) pass the rule-based
checks on purpose: they are what the judgment layer is for. The color
check catches the first, the placeholder check the second.
