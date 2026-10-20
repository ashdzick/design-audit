#!/usr/bin/env node
// Builds a shareable demo from a report folder, for GitHub Pages.
//   node scripts/build-demo.mjs <report folder> <out dir> [--page <label>]
// Re-renders the report with nothing local in it: the page address becomes
// --page (default: the audited target), and there's no command or project
// path for saving decisions, so the report says it's a demo instead.

import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readReport } from '../lib/write-report.mjs';
import { renderReport } from '../lib/report-html.mjs';

const argv = process.argv.slice(2);
const [dir, out] = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--page');
if (!dir || !out) {
  console.error('Usage: node scripts/build-demo.mjs <report folder> <out dir> [--page <label>]');
  process.exit(1);
}
const { meta, findings } = readReport(dir);
const label = argv.includes('--page') ? argv[argv.indexOf('--page') + 1] : meta.target;
mkdirSync(out, { recursive: true });
copyFileSync(join(dir, 'screenshot.png'), join(out, 'screenshot.png'));
const html = renderReport({
  page: { title: meta.title, url: label, ...meta.size },
  axeVersion: meta.axeVersion,
  auditedAt: new Date(meta.auditedAt).toLocaleDateString('en-US', { dateStyle: 'medium' }),
  threshold: meta.threshold,
  findings,
  dismissals: [],
  fileStem: meta.fileStem,
  openCommand: null,
  dismissalsFile: null,
});
const leaks = html.match(/\/Users\/|\/home\/|file:\/\//g);
if (leaks) {
  console.error(`Not written: the demo still contains local paths (${[...new Set(leaks)].join(', ')}).`);
  process.exit(1);
}
writeFileSync(join(out, 'index.html'), html);
console.log(`Demo: ${join(out, 'index.html')}`);
