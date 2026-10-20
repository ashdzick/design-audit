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
  local files, staging they work on, or the demo pages that come with the
  plugin. Never run it against another company's live product on someone's
  behalf.
- It needs Google Chrome installed: it drives the installed Chrome and
  doesn't download a browser. If Chrome is missing, the audit says so in one
  line; pass that on with where to get Chrome, and stop.
- The tool's own files are in `${CLAUDE_PLUGIN_ROOT}`. Run every command
  from the project the person is working in, as written below, so reports
  land in that project's `.design-audit/reports/` (git-ignored) and "Not an
  issue" decisions in `.design-audit/dismissals.json` (worth committing).
- If the person wants to try it without a page of their own, use the demo
  page: `${CLAUDE_PLUGIN_ROOT}/fixtures/lead-view/index.html`, a made-up car
  dealership's lead view with problems planted on purpose.

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
node ${CLAUDE_PLUGIN_ROOT}/scripts/audit.mjs <url-or-path> --threshold 90 --runs 3 --out .design-audit/reports
```

- `<url-or-path>`: an http(s) URL, a file:// URL, or a path to a local HTML file.
- `--threshold`: 50 to 100, the person's review threshold. Default 90. Ask
  the person if they have a preference; otherwise use the default and say so.
- Output goes to `.design-audit/reports/<page>-<time>/`: `report.html`, `findings.json`,
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
   node ${CLAUDE_PLUGIN_ROOT}/scripts/add-judgments.mjs <report folder>
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

## Fixing in the code

After the summary, offer once: "Want me to fix these in the code? I'll show
each change before I make it." Only go ahead if the person says yes.

1. **Never edit the plugin's own files**, including the demo pages in
   `${CLAUDE_PLUGIN_ROOT}/fixtures/`. To fix a demo page, copy its folder
   into the person's project as `try/<name>/`, audit the copy, and fix the
   copy. Say that you did.
2. **Find the code.** For a local HTML file, it's that file. For an app on
   localhost, search the project for the element: its text, its classes and
   the `html` snippet each element carries in `findings.json`.
3. **One change at a time, in report order** (Fix first, by severity). Show
   the change, say which finding it fixes and for which element, and make it
   only when the person approves. Identical elements (three unnamed buttons)
   can be one change.
4. **Use what the audit already knows.** The suggested alt text or `alt=""`
   from the judges, the measured contrast ratio and the one required, the
   finding's How to fix. Names, labels and alt text are content: propose the
   words, and let the person change them.
5. **Never make a finding go away without fixing it.** No `aria-hidden` or
   `role="presentation"` on things people need, no deleting elements, no
   turning off rules, and never marking anything not an issue for the
   person.
6. **Leave alone what isn't yours to decide.** Anything in Review, and text
   the judges suggested is part of a picture: tell the person, and let them
   decide in the report.
7. **Check the fixes.** Audit the page again with the same threshold and
   number of judges (judges included), then compare:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/compare-audits.mjs <report before> <report after>
   ```
   Report what's fixed, what's still there and anything new, as the script
   says. If a fix made something new, say so and offer to fix that too.

## Confidence, in brief

- Rule-based fail or pass: 100%.
- Rule cannot decide (axe "incomplete"): no number; always goes to a person.
- Judgment calls: measured, not stated. The same check runs several times
  (default 3) and confidence is the share of runs that agree.
- The threshold is the person's call. Anything below it, pass or fail, goes
  to a person; a low-confidence pass may be a miss.

## Demo page

`${CLAUDE_PLUGIN_ROOT}/fixtures/lead-view/index.html` is a synthetic dealership CRM lead view with
planted issues listed in `planted.json` next to it. Two of them (color-only
lead temperature dots, placeholder as the only label) pass the rule-based
checks on purpose: they are what the judgment layer is for. The color
check catches the first, the placeholder check the second.
