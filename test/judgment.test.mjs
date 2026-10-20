// Judgment checks (M2): runs merge into one finding with measured
// confidence (D6, D48), and the color check finds the planted dots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeRuns, mergeContrast, mergeSuggestions, mergeAlt, writeBriefs, judgedFindings } from '../lib/judgment.mjs';
import { checkAccessibility } from '../lib/check-a11y.mjs';
import { triage } from '../lib/triage.mjs';

const marks = ['c1', 'c2', 'c3'].map((id, i) => ({ id, selector: `#m${i}`, box: { x: 0, y: i * 20, w: 10, h: 10 }, color: 'rgb(220, 38, 38)', shape: 'dot', near: `Lead ${i + 1}`, html: `<span id="m${i}"></span>` }));
const fail = (...ids) => ({ check: 'color-only', verdict: 'fail', title: 'Lead temperature is shown by color alone', elements: ids.map((id) => ({ id, wrong: `${id} is red only.` })) });
const pass = { check: 'color-only', verdict: 'pass', elements: [] };

test('3 of 3 runs agree: a fail at 100%, in Fix', () => {
  const f = mergeRuns('color-only', marks, [fail('c1', 'c2'), fail('c1', 'c2'), fail('c1', 'c2')]);
  assert.equal(f.verdict, 'fail');
  assert.equal(f.confidence, 1);
  assert.deepEqual(f.runs, { agree: 3, of: 3 });
  assert.equal(f.method, 'judgment');
  assert.equal(f.source, 'usability');
  assert.deepEqual(f.elements.map((e) => e.selector), ['#m0', '#m1']);
  assert.equal(f.title, 'Lead temperature is shown by color alone');
  assert.deepEqual(triage([f], 0.9).fix, [f]);
});

test('2 of 3: a fail at 67%, below a 90% threshold so a person reviews it', () => {
  const f = mergeRuns('color-only', marks, [fail('c1'), fail('c1'), pass]);
  assert.equal(f.verdict, 'fail');
  assert.equal(Math.round(f.confidence * 100), 67);
  assert.deepEqual(triage([f], 0.9).review, [f]);
});

test('1 of 3: a pass at 67%, which a person reviews too (it may be a miss)', () => {
  const f = mergeRuns('color-only', marks, [fail('c1'), pass, pass]);
  assert.equal(f.verdict, 'pass');
  assert.deepEqual(f.runs, { agree: 2, of: 3 });
  assert.deepEqual(f.elements, []);
  assert.deepEqual(triage([f], 0.9).review, [f]);
});

test('a mark is listed when at least half the failing runs name it', () => {
  const f = mergeRuns('color-only', marks, [fail('c1', 'c3'), fail('c1'), fail('c1', 'c2')]);
  assert.deepEqual(f.elements.map((e) => e.selector), ['#m0']);
});

test('no runs, no finding', () => {
  assert.equal(mergeRuns('color-only', marks, []), null);
});

test('briefs and run files round-trip into findings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'design-audit-judge-'));
  try {
    assert.deepEqual(writeBriefs(dir, { 'color-only': marks }), ['color-only']);
    for (const n of [1, 2, 3]) writeFileSync(join(dir, 'judge', `color-only.run-${n}.json`), JSON.stringify(fail('c2')));
    const [f] = judgedFindings(dir);
    assert.equal(f.confidence, 1);
    assert.deepEqual(f.elements.map((e) => e.selector), ['#m1']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the color check finds the planted temperature dots on the lead view', async () => {
  const { candidates } = await checkAccessibility('fixtures/lead-view/index.html');
  const dots = candidates['color-only'];
  assert.equal(dots.length, 6, JSON.stringify(dots.map((d) => d.near)));
  assert.ok(dots.every((d) => d.shape === 'dot'));
  for (const name of ['Dana Whitfield', 'Marcus Ortega', 'Priya Raman', 'Glen Hoffmann', 'Ruth Ellison']) assert.ok(dots.some((d) => d.near === name), name);
});

test('the placeholder check finds fields named only by their placeholder, and only their own tag', async () => {
  const lead = (await checkAccessibility('fixtures/lead-view/index.html')).candidates['placeholder-label'];
  assert.deepEqual(lead.map((f) => [f.kind, f.placeholder, f.near]), [['text area', 'Add a note about this lead', 'Notes · Save note']]);
  // The fixture's "PLANTED" comment sits next to the field; it must never reach a judge.
  assert.ok(!/PLANTED|<!--/.test(JSON.stringify(lead)));
  const drive = (await checkAccessibility('fixtures/test-drive/index.html')).candidates['placeholder-label'];
  assert.deepEqual(drive.map((f) => [f.placeholder, f.near]), [['MM/DD/YYYY', 'Preferred date']]);
});

test('contrast second look: each piece of text lands by its own agreement', () => {
  const text = ['t1', 't2', 't3'].map((id, i) => ({ id, from: 'accessibility:color-contrast:unsure:image', selector: `#t${i}`, box: { x: 0, y: 0, w: 10, h: 10 }, text: `T${i}`, label: { text: `T${i}`, kind: 'text' }, html: `<p id="t${i}">`, htmlHash: 'h' + i, crop: `/c/t${i}.png` }));
  const runs = [
    { check: 'contrast-image', verdict: 'fail', elements: [{ id: 't1', wrong: 'Faint on the photo.' }, { id: 't2', wrong: 'Hard to read.' }] },
    { check: 'contrast-image', verdict: 'fail', elements: [{ id: 't1', wrong: 'Gray on gray.' }] },
    { check: 'contrast-image', verdict: 'fail', elements: [{ id: 't1', wrong: 'Low.' }] },
  ];
  const fs = mergeContrast('contrast-image', text, runs);
  const by = Object.fromEntries(fs.map((f) => [f.id.split(':').slice(-2).join(':'), f]));
  assert.deepEqual(Object.keys(by).sort(), ['fail:3', 'pass:2', 'pass:3']);
  assert.equal(by['fail:3'].title, 'Text on images is too low-contrast to read');
  assert.deepEqual(by['fail:3'].elements.map((e) => e.selector), ['#t0']);
  assert.equal(by['pass:2'].title, 'Text on images reads clearly');
  assert.deepEqual(by['pass:2'].elements.map((e) => e.selector), ['#t1']);
  assert.ok(fs.every((f) => f.source === 'accessibility' && f.method === 'judgment'));
  // 3 of 3 fail goes to Fix; 2 of 3 pass goes to a person; 3 of 3 pass is passed
  const t = triage(fs, 0.9);
  assert.deepEqual([t.fix.length, t.review.length, t.passed.length], [1, 1, 1]);
});

test('suggested reasons: a majority of judges calling text part of a picture becomes a suggestion', () => {
  const text = ['s1', 's2', 's3'].map((id, i) => ({ id, selector: `#s${i}`, text: `T${i}` }));
  const runs = [
    { check: 'suggest-reason', elements: [{ id: 's1', why: 'Part of a drawn product screenshot.' }, { id: 's2', why: 'In a logo.' }] },
    { check: 'suggest-reason', elements: [{ id: 's1', why: 'Inside a product mockup.' }] },
    { check: 'suggest-reason', elements: [{ id: 's1', why: 'Mockup text.' }] },
  ];
  const got = mergeSuggestions(text, runs);
  assert.deepEqual(Object.keys(got), ['#s0']);
  assert.deepEqual({ ...got['#s0'], why: undefined }, { reason: 'decorative', why: undefined, agree: 3, of: 3, confidence: 1 });
});

test('alt suggestions: decorative means alt=""; otherwise the shortest drafted description', () => {
  const imgs = [{ id: 'i1', selector: '#a' }, { id: 'i2', selector: '#b' }];
  const runs = [
    { check: 'suggest-alt', elements: [{ id: 'i1', decorative: true }, { id: 'i2', decorative: false, alt: 'Silver 2025 Ridgeline Crossover SE, front three-quarter view' }] },
    { check: 'suggest-alt', elements: [{ id: 'i1', decorative: true }, { id: 'i2', decorative: false, alt: "Photo of the lead's car" }] },
    { check: 'suggest-alt', elements: [{ id: 'i1', decorative: false, alt: 'A car' }, { id: 'i2', decorative: true }] },
  ];
  const got = mergeAlt(imgs, runs);
  assert.deepEqual(got['#a'], { fix: 'decorative', agree: 2, of: 3, confidence: 2 / 3 });
  assert.equal(got['#b'].fix, 'describe');
  assert.equal(got['#b'].alt, 'Photo of the lead’s car');
  assert.equal(got['#b'].agree, 2);
});
