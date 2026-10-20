// The finding shape the report reads: plain sentences, measured values,
// reason groups and element names, built from axe's own data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromAxe } from '../lib/findings.mjs';
import { PASS_TITLES } from '../lib/plain-language.mjs';

const node = (selector, data, message = 'msg') => ({ target: [selector], html: `<p class="${selector}">x</p>`, any: [{ data, message }], failureSummary: 'Fix any of the following:\n  ' + message });
const rule = (id, nodes, extra = {}) => ({ id, impact: 'serious', tags: ['wcag2aa', 'wcag143'], help: 'Help', description: 'Desc', helpUrl: 'u', nodes, ...extra });
const ratio = (r) => ({ contrastRatio: r, expectedContrastRatio: '4.5:1', fgColor: '#777', bgColor: '#fff' });
const results = (r) => ({ violations: [], incomplete: [], passes: [], ...r });

test('contrast fails: measured value against the requirement, worst first, range on the finding (D24)', () => {
  const [f] = fromAxe(results({ violations: [rule('color-contrast', [node('a', ratio(4.49)), node('b', ratio(3.1)), node('c', ratio(4.26))])] }));
  assert.deepEqual(f.elements.map((e) => e.selector), ['b', 'c', 'a']);
  assert.equal(f.elements[0].wrong.text, '3.1 : 1, needs 4.5 : 1');
  assert.deepEqual(f.measured, { min: 3.1, max: 4.49, need: 4.5 });
  assert.equal(f.owner, 'Design');
});

test("can't-tell contrast: one issue per plain reason, SVG text counts as diagram text (D26, D39)", () => {
  const nodes = [node('g', { messageKey: 'bgGradient' }), node('t1', { messageKey: 'bgOverlap' }), node('t2', { messageKey: 'shortTextContent' }), node('o', { messageKey: 'bgOverlap' }), node('s', { messageKey: 'nonBmp' })];
  const places = { t1: { inSvg: true, box: null, label: { text: 'Monitor', kind: 'diagram text' } }, t2: { inSvg: true } };
  const fs = fromAxe(results({ incomplete: [rule('color-contrast', nodes)] }), places);
  assert.deepEqual(fs.map((f) => [f.id, f.elementCount]), [
    ['accessibility:color-contrast:unsure:diagram', 2], ['accessibility:color-contrast:unsure:gradient', 1],
    ['accessibility:color-contrast:unsure:symbol', 1], ['accessibility:color-contrast:unsure:overlap', 1],
  ]);
  assert.ok(fs.every((f) => f.verdict === 'unsure' && f.check === 'color-contrast'));
  assert.equal(fs[0].title, 'Contrast couldn’t be measured: text inside diagrams');
  assert.equal(fs[0].listTitle, 'Text inside diagrams');
  assert.equal(fs[0].listNote, 'Contrast couldn’t be measured');
  assert.match(fs[0].fix, /^This text is part of a chart/);
  assert.equal(fs[0].elements[0].label.text, 'Monitor');
  assert.match(fs[1].elements[0].wrong.text, /gradient/);
});

test('every element gets one plain sentence; unknown rules fall back to axe', () => {
  const [a, b] = fromAxe(results({ violations: [rule('button-name', [node('x', null)]), rule('some-new-rule', [node('y', null, 'Element is odd')])] }));
  assert.equal(a.elements[0].wrong.text, 'No visible text, label or title, so this button has no name.');
  assert.equal(b.elements[0].wrong.text, 'Element is odd');
  assert.deepEqual(b.elements[0].checks, ['Element is odd']);
});

test('passed checks get plain titles', () => {
  const [f] = fromAxe(results({ passes: [rule('button-name', [node('x', null)], { help: 'Buttons must have discernible text' })] }));
  assert.equal(f.title, 'Buttons have names');
  assert.equal(f.elements[0].wrong, undefined);
  assert.ok(Object.keys(PASS_TITLES).length > 80);
});
