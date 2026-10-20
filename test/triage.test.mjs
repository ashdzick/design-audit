import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triage } from '../lib/triage.mjs';
import { rank } from '../lib/rank.mjs';

const f = (id, verdict, confidence, impact = 'serious', elementCount = 1) => ({ id, verdict, confidence, impact, elementCount });

test('threshold sorts findings into fix, review and passed', () => {
  const findings = [f('a', 'fail', 1), f('b', 'fail', 0.8), f('c', 'pass', 0.6), f('d', 'unsure', null), f('e', 'pass', 1)];
  const ids = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map((x) => x.id)]));
  assert.deepEqual(ids(triage(findings, 0.9)), { fix: ['a'], review: ['b', 'c', 'd'], passed: ['e'] });
  assert.deepEqual(ids(triage(findings, 0.75)), { fix: ['a', 'b'], review: ['c', 'd'], passed: ['e'] });
  assert.deepEqual(ids(triage(findings, 0.5)), { fix: ['a', 'b'], review: ['d'], passed: ['c', 'e'] });
});

test('a finding exactly at the threshold clears it', () => {
  assert.equal(triage([f('a', 'fail', 0.9)], 0.9).fix.length, 1);
});

test('cannot-tell findings go to a person at any threshold', () => {
  assert.equal(triage([f('d', 'unsure', null)], 0.5).review.length, 1);
});

test('ranking: verdict, then impact, then element count, then id', () => {
  const order = rank([
    f('pass', 'pass', 1, 'critical'),
    f('minor', 'fail', 1, 'minor', 9),
    f('serious-1', 'fail', 1, 'serious', 1),
    f('serious-4', 'fail', 1, 'serious', 4),
    f('critical', 'fail', 1, 'critical'),
    f('unsure', 'unsure', null, 'critical'),
  ]).map((x) => x.id);
  assert.deepEqual(order, ['critical', 'serious-4', 'serious-1', 'minor', 'unsure', 'pass']);
});
