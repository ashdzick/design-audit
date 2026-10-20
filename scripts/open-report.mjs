#!/usr/bin/env node
// Opens a Design Audit report so "Not an issue" can save.
//   node scripts/open-report.mjs <report folder> [--port 4780] [--no-browser]
// Serves the report on this computer (127.0.0.1 only) and opens it in the
// browser. Decisions save to .design-audit/dismissals.json in the audited
// project. Ctrl-C stops it.

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveReport } from '../lib/serve.mjs';

export async function openReport(dir, { port = 4780, browser = true } = {}) {
  const { url } = await serveReport(dir, { port });
  console.log(`\nReport open at ${url}\nDecisions you make there save to the project. Ctrl-C to stop.`);
  if (browser) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    execFile(cmd, [url], () => {});
  }
  return url;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const dir = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--port');
  const port = argv.includes('--port') ? Number(argv[argv.indexOf('--port') + 1]) : 4780;
  if (!dir) {
    console.error('Usage: node scripts/open-report.mjs <report folder> [--port 4780] [--no-browser]');
    process.exit(1);
  }
  await openReport(dir, { port, browser: !argv.includes('--no-browser') });
}
