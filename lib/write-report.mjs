// Writes findings.json and report.html into a report folder. The audit
// writes them first; scripts/add-judgments.mjs writes them again once the
// judgment runs are in (M2), from what findings.json kept.
//
// meta: { target, url, page, projectDir, auditedAt (ISO), axeVersion,
//         threshold, title, size, fileStem, openCommand, dismissalsFile }

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderReport } from './report-html.mjs';
import { loadRemembered } from './dismissals.mjs';

export function writeReport(dir, meta, findings) {
  writeFileSync(join(dir, 'findings.json'), JSON.stringify({ ...meta, findings }, null, 2) + '\n');
  const remembered = loadRemembered(meta.projectDir).filter((d) => d.page === meta.page);
  writeFileSync(join(dir, 'report.html'), renderReport({
    page: { title: meta.title, url: meta.url, ...meta.size },
    axeVersion: meta.axeVersion,
    auditedAt: new Date(meta.auditedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
    threshold: meta.threshold,
    findings,
    dismissals: remembered,
    fileStem: meta.fileStem,
    openCommand: meta.openCommand,
    dismissalsFile: meta.dismissalsFile,
  }));
  return remembered;
}

export function readReport(dir) {
  const { findings, ...meta } = JSON.parse(readFileSync(join(dir, 'findings.json'), 'utf8'));
  return { meta, findings };
}
