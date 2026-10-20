// Before and after a round of fixes: fixed, still there, new (D58).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareAudits, byTitle } from '../lib/compare.mjs';

const f = (check, verdict, els, extra = {}) => ({ id: check, check, verdict, confidence: verdict === 'unsure' ? null : 1, title: check, scope: 'elements', elements: els.map(([selector, text]) => ({ selector, label: { text } })), ...extra });

test('fixed, still there and new, element by element', () => {
  const before = [f('button-name', 'fail', [['#a', ''], ['#b', '']]), f('image-alt', 'fail', [['img', '']]), f('region', 'pass', [])];
  const after = [f('button-name', 'fail', [['#b', '']]), f('image-alt', 'pass', []), f('label', 'fail', [['#q', '']])];
  const { fixed, still, added } = compareAudits(before, after, 0.9);
  assert.deepEqual(fixed.map((x) => `${x.check} ${x.selector}`), ['button-name #a', 'image-alt img']);
  assert.deepEqual(still.map((x) => `${x.check} ${x.selector}`), ['button-name #b']);
  assert.deepEqual(added.map((x) => `${x.check} ${x.selector}`), ['label #q']);
});

test('an element whose position in the code moved is still recognised by its text', () => {
  const before = [f('color-contrast', 'fail', [['div:nth-child(2) > p', 'Oct 17, 4:12 PM']])];
  const after = [f('color-contrast', 'fail', [['div:nth-child(3) > p', 'Oct 17, 4:12 PM']])];
  const { fixed, still } = compareAudits(before, after, 0.9);
  assert.equal(fixed.length, 0);
  assert.equal(still.length, 1);
});

test('a judged finding that now passes counts as fixed', () => {
  const before = [f('color-only', 'fail', [['.dot1', 'Dana'], ['.dot2', 'Marcus']], { method: 'judgment', confidence: 1 })];
  const after = [f('color-only', 'pass', [], { method: 'judgment', confidence: 1 })];
  assert.deepEqual(byTitle(compareAudits(before, after, 0.9).fixed), [{ title: 'color-only', count: 2 }]);
});
