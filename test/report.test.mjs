// The report holds itself to the same rules it checks (D23): build the
// real report for the lead-view fixture, then audit that report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAccessibility } from '../lib/check-a11y.mjs';
import { fromAxe } from '../lib/findings.mjs';
import { rank } from '../lib/rank.mjs';
import { triage } from '../lib/triage.mjs';
import { renderReport } from '../lib/report-html.mjs';
import { mergeRuns } from '../lib/judgment.mjs';

// Builds the lead-view report (optionally with judged findings), then
// audits the report itself.
async function selfAudit(judged = () => []) {
  const dir = mkdtempSync(join(tmpdir(), 'design-audit-self-'));
  try {
    const run = await checkAccessibility('fixtures/lead-view/index.html');
    const findings = rank([...fromAxe(run.results, run.places), ...judged(run)]);
    writeFileSync(join(dir, 'screenshot.png'), run.screenshot);
    writeFileSync(join(dir, 'report.html'), renderReport({
      page: { title: run.title, url: run.url, ...run.size }, axeVersion: run.axeVersion, auditedAt: 'Oct 19, 2026, 3:00 PM',
      threshold: 0.9, findings, openCommand: 'node scripts/open-report.mjs reports/x', dismissalsFile: '.design-audit/dismissals.json',
    }));
    const self = rank(fromAxe((await checkAccessibility(join(dir, 'report.html'))).results));
    return triage(self, 0.9).fix.map((f) => `${f.check}: ${f.elements.map((e) => e.selector).join(', ')}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the report passes its own audit: 0 to fix', async () => {
  assert.deepEqual(await selfAudit(), []);
});

// With a usability finding the report shows the kind and the filter (D46);
// those have to pass too.
test('with a judged usability finding, still 0 to fix', async () => {
  const judged = (run) => {
    const dots = run.candidates['color-only'];
    const r = { check: 'color-only', verdict: 'fail', elements: dots.map((d) => ({ id: d.id, wrong: 'Red only.' })) };
    return [mergeRuns('color-only', dots, [r, r, { check: 'color-only', verdict: 'pass', elements: [] }])];
  };
  assert.deepEqual(await selfAudit(judged), []);
});
