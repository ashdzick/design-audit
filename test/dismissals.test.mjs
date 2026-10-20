// "Not an issue" per element: saved in the audited project, matched by
// page and element, back for review when the element changes (D22, D30).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { splitDismissed, keyed, pageKey, saveDismissal, removeDismissal, loadRemembered, loadRun } from '../lib/dismissals.mjs';
import { serveReport } from '../lib/serve.mjs';

const el = (selector, htmlHash) => ({ selector, htmlHash });
const finding = (elements) => ({ id: 'accessibility:color-contrast', check: 'color-contrast', verdict: 'fail', confidence: 1, elementCount: elements.length, elements });
const d = (selector, htmlHash, reason = 'decorative') => ({ check: 'color-contrast', selector, htmlHash, reason });

test('a dismissed element leaves the finding; the rest stay', () => {
  const { active, dismissed } = splitDismissed([finding([el('a', '1'), el('b', '2')])], keyed([d('a', '1')]));
  assert.deepEqual(active[0].elements.map((e) => e.selector), ['b']);
  assert.equal(active[0].elementCount, 1);
  assert.equal(active[0].dismissedCount, 1);
  assert.equal(dismissed[0].e.selector, 'a');
});

test('a finding with every element dismissed leaves Fix', () => {
  const { active, dismissed } = splitDismissed([finding([el('a', '1')])], keyed([d('a', '1')]));
  assert.equal(active.length, 0);
  assert.equal(dismissed.length, 1);
});

test('an element whose code changed comes back, carrying the old decision', () => {
  const { active, dismissed } = splitDismissed([finding([el('a', 'new')])], keyed([d('a', 'old', 'accepted-risk')]));
  assert.equal(dismissed.length, 0);
  assert.equal(active[0].elements[0].changed.reason, 'accepted-risk');
});

test('pages match by path inside the project, or by URL without the fragment', () => {
  const project = mkdtempSync(join(tmpdir(), 'design-audit-proj-'));
  try {
    assert.equal(pageKey(pathToFileURL(join(project, 'site', 'index.html')).href, project), 'site/index.html');
    assert.equal(pageKey('https://dzick.com', project), 'https://dzick.com/');
    assert.equal(pageKey('https://dzick.com/#work', project), 'https://dzick.com/');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('remembered dismissals go to the project; this-run ones stay with the report', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'design-audit-proj-'));
  const reportDir = mkdtempSync(join(tmpdir(), 'design-audit-rep-'));
  try {
    const where = { projectDir, reportDir };
    const entry = { page: 'p', ...d('a', '1') };
    saveDismissal(where, entry, true);
    assert.equal(loadRemembered(projectDir).length, 1);
    assert.ok(existsSync(join(projectDir, '.design-audit', 'dismissals.json')));
    saveDismissal(where, entry, false);
    assert.equal(loadRemembered(projectDir).length, 0);
    assert.equal(loadRun(reportDir).length, 1);
    removeDismissal(where, entry);
    assert.equal(loadRun(reportDir).length, 0);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(reportDir, { recursive: true, force: true });
  }
});

test('the report server saves a dismissal and refuses other sites', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'design-audit-proj-'));
  const reportDir = mkdtempSync(join(tmpdir(), 'design-audit-rep-'));
  writeFileSync(join(reportDir, 'findings.json'), JSON.stringify({ projectDir, page: 'https://example.com/' }));
  writeFileSync(join(reportDir, 'report.html'), '<!doctype html><title>r</title>');
  const { server, url } = await serveReport(reportDir, { port: 0 });
  try {
    const post = (body, headers = {}) => fetch(url + 'api/dismissals', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    assert.equal((await post({ check: 'color-contrast', selector: 'a', htmlHash: '1' })).status, 400, 'a reason is required');
    assert.equal((await post({ ...d('a', '1'), remember: true }, { origin: 'https://evil.example' })).status, 403);
    const ok = await post({ ...d('a', '1'), note: ' decorative arrow ', remember: true });
    assert.equal(ok.status, 200);
    const saved = JSON.parse(readFileSync(join(projectDir, '.design-audit', 'dismissals.json'), 'utf8')).dismissals;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].page, 'https://example.com/');
    assert.equal(saved[0].note, 'decorative arrow');
    assert.ok(saved[0].by);
    const got = await (await fetch(url + 'api/dismissals')).json();
    assert.equal(got.remembered.length, 1);
    assert.equal((await fetch(url)).status, 200);
  } finally {
    server.close();
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(reportDir, { recursive: true, force: true });
  }
});
