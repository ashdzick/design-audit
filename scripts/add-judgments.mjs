#!/usr/bin/env node
// Adds judgment runs to a report (M2).
//   node scripts/add-judgments.mjs <report folder>
// Reads judge/<check>.run-<n>.json, measures confidence as the share of
// runs that agree (D6), and rewrites findings.json and report.html with the
// judged findings ranked in with the rest. Run it again after more runs come
// in; it replaces the judged findings each time.

import { rank } from '../lib/rank.mjs';
import { triage } from '../lib/triage.mjs';
import { judgedFindings, coveredUnsure, suggestions, altSuggestions, IMAGE_RULES } from '../lib/judgment.mjs';
import { readReport, writeReport } from '../lib/write-report.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/add-judgments.mjs <report folder>');
  process.exit(1);
}

const { meta, findings } = readReport(dir);
const judged = judgedFindings(dir);
const suggested = suggestions(dir);
const alts = altSuggestions(dir);
if (!judged.length && !Object.keys(suggested).length && !Object.keys(alts).length) {
  console.error(`No judgment runs in ${join(dir, 'judge')} yet.`);
  process.exit(1);
}
// Start from the rule-based findings as audited; text the judges have
// looked at again leaves its "couldn't decide" finding.
const rulesFile = join(dir, 'judge', 'rules.json');
const rules = existsSync(rulesFile) ? JSON.parse(readFileSync(rulesFile, 'utf8')) : findings.filter((f) => f.method !== 'judgment');
const covered = coveredUnsure(dir);
const kept = rules.flatMap((f) => {
  if (!covered[f.id]) return [f];
  const elements = f.elements.filter((e) => !covered[f.id].has(e.selector));
  return elements.length ? [{ ...f, elements, elementCount: elements.length }] : [];
});
// Suggested reasons (D32) ride on each low-contrast element they're about,
// wherever that element ended up.
const withSuggestions = (f) => {
  if (f.verdict === 'pass') return f;
  if (f.check === 'color-contrast') return { ...f, elements: f.elements.map((e) => (suggested[e.selector] ? { ...e, suggest: suggested[e.selector] } : e)) };
  // Images: a suggested fix, alt="" or a drafted description (D55).
  if (IMAGE_RULES.includes(f.check)) return { ...f, elements: f.elements.map((e) => (alts[e.selector] ? { ...e, suggestFix: alts[e.selector] } : e)) };
  return f;
};
const all = rank([...kept, ...judged].map(withSuggestions));
writeReport(dir, meta, all);

const t = triage(judged, meta.threshold);
const where = (f) => (t.fix.includes(f) ? 'Fix' : t.review.includes(f) ? 'Review' : 'Passed');
for (const f of judged) {
  const els = f.verdict === 'fail' ? `, ${f.elementCount} element${f.elementCount === 1 ? '' : 's'}` : '';
  console.log(`${f.title}: ${f.verdict}, ${f.runs.agree} of ${f.runs.of} runs agree (${Math.round(f.confidence * 100)}%)${els} → ${where(f)}`);
}
const n = Object.keys(suggested).length;
if (n) console.log(`Suggested “Decorative” for ${n} element${n === 1 ? '' : 's'}; a person confirms each one.`);
for (const s of Object.values(alts)) console.log(s.fix === 'decorative' ? `Suggested fix: alt="" (decorative), ${s.agree} of ${s.of} judges.` : `Suggested alt text: “${s.alt}”, ${s.agree} of ${s.of} judges say it needs one.`);
console.log(`\nReport: ${join(dir, 'report.html')}`);
