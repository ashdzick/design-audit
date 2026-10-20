// Runs the real audit (headless Chrome + axe-core) on the lead-view fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkAccessibility } from '../lib/check-a11y.mjs';
import { fromAxe } from '../lib/findings.mjs';
import { rank } from '../lib/rank.mjs';

const planted = JSON.parse(readFileSync(new URL('../fixtures/lead-view/planted.json', import.meta.url))).planted;
const audit = async () => rank(fromAxe((await checkAccessibility('fixtures/lead-view/index.html')).results));

test('every part-1 planted issue is caught with the expected verdict', async () => {
  const findings = await audit();
  for (const p of planted.filter((x) => x.part === 1)) {
    const found = findings.find((f) => f.check === p.check);
    assert.ok(found, `missed planted issue: ${p.check} (${p.where})`);
    assert.equal(found.verdict, p.verdict, `${p.check}: expected ${p.verdict}, got ${found.verdict}`);
  }
});

test('no unplanned failures on the fixture', async () => {
  const expected = new Set(planted.filter((x) => x.part === 1 && x.verdict === 'fail').map((x) => x.check));
  const unplanned = (await audit()).filter((f) => f.verdict === 'fail' && !expected.has(f.check)).map((f) => f.check);
  assert.deepEqual(unplanned, []);
});

test('same page, same findings, same order', async () => {
  const strip = (fs) => JSON.stringify(fs.map(({ id, verdict, confidence, elementCount }) => ({ id, verdict, confidence, elementCount })));
  assert.equal(strip(await audit()), strip(await audit()));
});
