#!/usr/bin/env node
// Compares two report folders for the same page: before and after a round
// of fixes.
//   node scripts/compare-audits.mjs <before folder> <after folder>
// Uses the "before" report's threshold. Prints what's fixed, what's still
// there and what's new, grouped by issue.

import { readReport } from '../lib/write-report.mjs';
import { compareAudits, byTitle } from '../lib/compare.mjs';

const [beforeDir, afterDir] = process.argv.slice(2);
if (!beforeDir || !afterDir) {
  console.error('Usage: node scripts/compare-audits.mjs <before folder> <after folder>');
  process.exit(1);
}
const before = readReport(beforeDir), after = readReport(afterDir);
const { fixed, still, added } = compareAudits(before.findings, after.findings, before.meta.threshold);
const els = (n) => `${n} element${n === 1 ? '' : 's'}`;
const list = (xs) => byTitle(xs).forEach(({ title, count }) => console.log(`  - ${title} (${els(count)})`));
console.log(`Fixed: ${els(fixed.length)}`); list(fixed);
console.log(`Still there: ${els(still.length)}`); list(still);
console.log(`New: ${els(added.length)}`); list(added);
