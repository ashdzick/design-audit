#!/usr/bin/env node
// Design Audit CLI.
//   node scripts/audit.mjs <url-or-path> [--threshold 90] [--runs 3] [--out reports] [--project .] [--open]
// Writes report.html, findings.json and screenshot.png to a new folder
// under --out and prints a short summary. Judgment checks (M2) get a brief
// each in <folder>/judge/; once --runs judges have answered,
// scripts/add-judgments.mjs adds them to the report. Elements marked "Not an issue"
// are read from <project>/.design-audit/dismissals.json (default project:
// the folder you run it from). --open serves the report on this computer
// so new decisions can be saved there.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAccessibility } from '../lib/check-a11y.mjs';
import { fromAxe } from '../lib/findings.mjs';
import { rank } from '../lib/rank.mjs';
import { triage } from '../lib/triage.mjs';
import { pageKey, projectFile, splitDismissed, keyed } from '../lib/dismissals.mjs';
import { writeReport } from '../lib/write-report.mjs';
import { writeBriefs, contrastCandidates, suggestCandidates, altCandidates, DEFAULT_RUNS } from '../lib/judgment.mjs';
import { openReport } from './open-report.mjs';

function parseArgs(argv) {
  const args = { threshold: 90, runs: DEFAULT_RUNS, out: 'reports', project: '.', open: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--threshold') args.threshold = Number(argv[++i]);
    else if (argv[i] === '--runs') args.runs = Number(argv[++i]);
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--project') args.project = argv[++i];
    else if (argv[i] === '--open') args.open = true;
    else rest.push(argv[i]);
  }
  args.target = rest[0];
  return args;
}

const slug = (s) => s.replace(/^[a-z]+:\/\//i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60).toLowerCase();
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const shell = (p) => (/^[\w./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`);

const args = parseArgs(process.argv.slice(2));
if (!args.target || !(args.threshold >= 50 && args.threshold <= 100) || !(Number.isInteger(args.runs) && args.runs >= 1 && args.runs <= 10)) {
  console.error('Usage: node scripts/audit.mjs <url-or-path> [--threshold 50-100] [--runs 1-10] [--out dir] [--project dir] [--open]');
  process.exit(1);
}

const now = new Date();
const projectDir = resolve(args.project);
const run = await checkAccessibility(args.target);
const findings = rank(fromAxe(run.results, run.places));
const threshold = args.threshold / 100;
const page = pageKey(run.url, projectDir);
const dir = join(args.out, `${slug(args.target)}-${stamp(now)}`);
mkdirSync(dir, { recursive: true });

// How to reopen this report so decisions can save, from where you ran it.
const openCommand = `node ${shell(relative(process.cwd(), fileURLToPath(new URL('./open-report.mjs', import.meta.url))))} ${shell(dir)}`;
writeFileSync(join(dir, 'screenshot.png'), run.screenshot);
const remembered = writeReport(dir, {
  target: args.target, url: run.url, page, projectDir, auditedAt: now.toISOString(), axeVersion: run.axeVersion, threshold,
  title: run.title, size: run.size,
  fileStem: 'design-audit-' + slug(run.title || args.target),
  openCommand: `cd ${shell(process.cwd())} && ${openCommand}`,
  dismissalsFile: relative(projectDir, projectFile(projectDir)) + ' in ' + projectDir,
}, findings);
const briefs = writeBriefs(dir, { ...run.candidates, ...contrastCandidates(dir, findings, run.crops), ...suggestCandidates(dir, findings, run.crops), ...altCandidates(dir, findings, run.crops) }, { runs: args.runs });
// The rule-based findings as audited, so judgments can be merged in again
// without losing the "couldn't decide" items they replace.
if (briefs.length) writeFileSync(join(dir, 'judge', 'rules.json'), JSON.stringify(findings) + '\n');

const { active, dismissed } = splitDismissed(findings, keyed(remembered));
const changed = active.flatMap((f) => f.elements.filter((e) => e.changed));
const t = triage(active, threshold);
// Passed counts checks that passed everywhere, as the report does (D25).
const passed = t.passed.filter((f) => !findings.some((g) => g.check === f.check && g.verdict !== 'pass'));
const els = (n) => `${n} element${n === 1 ? '' : 's'}`;
console.log(`Design Audit: ${run.title || args.target}`);
console.log(`Threshold ${args.threshold}%: ${t.fix.length} to fix, ${t.review.length} for a person, ${passed.length} passed\n`);
t.fix.forEach((f, i) => console.log(`${i + 1}. [${f.impact}] ${f.title} (${els(f.elementCount)})`));
if (t.review.length) {
  console.log('\nA person reviews:');
  t.review.forEach((f) => console.log(`- ${f.title} (${els(f.elementCount)}${f.confidence === null ? ', rule can’t decide' : `, ${Math.round(f.confidence * 100)}%`})`));
}
if (dismissed.length) console.log(`\n${els(dismissed.length)} marked not an issue (${relative(process.cwd(), projectFile(projectDir))}).`);
if (changed.length) console.log(`${els(changed.length)} changed since marked not an issue, back for review.`);
console.log(`\nReport: ${join(dir, 'report.html')}`);
if (briefs.length) {
  console.log(`\nJudgment checks waiting (${briefs.join(', ')}): ${args.runs} judges answer each brief in ${join(dir, 'judge')}, then:`);
  console.log(`  node ${shell(relative(process.cwd(), fileURLToPath(new URL('./add-judgments.mjs', import.meta.url))))} ${shell(dir)}`);
}
if (args.open) await openReport(dir);
else console.log(`To mark elements not an issue: ${openCommand}`);
