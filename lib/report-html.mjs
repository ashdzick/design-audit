// The HTML report: layout 2 from the mockups (D19, D25 to D31). One
// self-contained page next to screenshot.png. Styles (report.css) and the
// page script (report-client.js) are inlined with the findings, along with
// triage() and splitDismissed(), so the page sorts and applies dismissals
// with the same code as the CLI.

import { readFileSync } from 'node:fs';
import { triage } from './triage.mjs';
import { splitDismissed } from './dismissals.mjs';

const CSS = readFileSync(new URL('./report.css', import.meta.url), 'utf8');
const CLIENT = readFileSync(new URL('./report-client.js', import.meta.url), 'utf8');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// page: { title, url, w, h }   dismissals: remembered entries for this page
export function renderReport({ page, axeVersion, auditedAt, threshold, findings, dismissals = [], screenshotFile = 'screenshot.png', fileStem = 'design-audit', openCommand, dismissalsFile }) {
  // Passed checks show only their count, so their elements stay in
  // findings.json and out of the page.
  const lean = findings.map((f) => (f.verdict === 'pass' ? { ...f, elements: [] } : f));
  const data = { page: { ...page, screenshot: screenshotFile }, axeVersion, auditedAt, threshold, findings: lean, dismissals, fileStem, openCommand, dismissalsFile };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>Design Audit · ${esc(page.title || page.url)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${CSS}</style>
</head>
<body>
<div class="app">
  <header class="top">
    <button class="tbtn icon" id="side-btn" aria-controls="side" aria-expanded="true" aria-label="Hide the list"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10"/></svg></button>
    <div class="mark"><i aria-hidden="true"></i>Design Audit</div>
    <div class="crumb"><span aria-hidden="true">/</span><b title="${esc(page.url)}">${esc(page.title || page.url)}</b></div>
    <div class="spacer"></div>
    <span class="meta">Audited ${esc(auditedAt)}</span>
    <div class="pop-wrap">
      <button class="tbtn" id="th-btn" aria-haspopup="dialog" aria-expanded="false">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 4h7M12 4h2M2 12h2M7 12h7"/><circle cx="10.5" cy="4" r="1.6"/><circle cx="5.5" cy="12" r="1.6"/></svg>
        Threshold <b id="th-val"></b>
      </button>
      <div class="pop thp" id="th-pop" role="dialog" aria-label="Review threshold" hidden>
        <h2>Review threshold</h2>
        <p>Anything the audit is less sure of than this goes to a person, pass or fail.</p>
        <div class="row2"><input id="th" type="range" min="50" max="100" step="5" aria-label="Review threshold"><output id="th-out" for="th"></output></div>
        <div class="moves"><div><b id="m-fix"></b><span>Fix</span></div><div><b id="m-review"></b><span>Review</span></div><div><b id="m-passed"></b><span>Passed</span></div></div>
        <div class="judged" id="judged"></div>
      </div>
    </div>
    <div class="pop-wrap">
      <button class="tbtn" id="dl" aria-haspopup="true" aria-expanded="false">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"/></svg>Download
      </button>
      <div class="pop menu" id="dl-menu" hidden>
        <button id="dl-pdf">PDF<small>The report, laid out for sharing</small></button>
        <button id="dl-csv">CSV<small>One row per finding, for Jira or a sheet</small></button>
      </div>
    </div>
  </header>
  <div class="main">
    <nav class="list" id="side" aria-label="Findings">
      <div class="list-head"><div class="tab-row"><div class="tabs" role="tablist" aria-label="Findings by what to do">
        <button class="tab" role="tab" data-tab="fix" aria-controls="list">Fix <span class="n" id="n-fix"></span></button>
        <button class="tab" role="tab" data-tab="review" aria-controls="list">Review <span class="n" id="n-review"></span></button>
        <button class="tab" role="tab" data-tab="passed" aria-controls="list">Passed <span class="n" id="n-passed"></span></button>
      </div>
      <div class="pop-wrap kf" id="kf" hidden>
        <button class="kbtn" id="kf-btn" aria-haspopup="true" aria-expanded="false" aria-label="Filter by kind of finding"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2.5 3.5h11L9.5 8.5v4l-3 1.5v-5.5z"/></svg></button>
        <button class="kbtn on" id="kf-clear" hidden></button>
        <div class="pop menu kmenu" id="kf-menu" role="menu" aria-label="Show" hidden></div>
      </div></div></div>
      <div id="list" role="tabpanel"></div>
    </nav>
    <main class="detail"><div class="inner" id="detail"></div></main>
  </div>
</div>
<div id="print"></div>
<script type="application/json" id="audit-data">${json}</script>
<script>
${triage.toString()}
${splitDismissed.toString()}
${CLIENT}</script>
</body>
</html>
`;
}
