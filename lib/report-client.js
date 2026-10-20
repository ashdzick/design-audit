// The report page's script, ported from mockups/layout-2-zoomed-crop.html.
// report-html.mjs inlines it after triage() and splitDismissed(), so the
// page sorts and applies dismissals with the same code as the CLI.
// Data comes from the #audit-data block.

const A = JSON.parse(document.getElementById('audit-data').textContent);
const S = { tab: 'fix', t: A.threshold, sel: null, el: 0, view: 'close', form: null, closed: new Set(), live: false, kind: null };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const pct = (c) => (c === null ? null : Math.round(c * 100));
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const day = (iso) => { const d = new Date(iso); return isNaN(d) ? String(iso ?? '') : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); };
const SEV = { critical: 'crit', serious: 'ser', moderate: 'mod', minor: 'min' };
const CHEV = '<svg class="chev" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>';
const STEP = (dir) => `<svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${dir < 0 ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6 4.5 9.5'}"/></svg>`;

// ---- Dismissals (D22, D29 to D31). Remembered ones came in with the
// report; served by scripts/open-report.mjs, the page reads and saves them
// through the local server. Opened from a file, it can show them but not
// change them.
const REASONS = [
  ['decorative', 'Decorative', 'Pure decoration, or part of a picture (WCAG incidental)'],
  ['not-applicable', 'Not applicable here', 'The rule doesn’t fit this case'],
  ['accepted-risk', 'Accepted risk, won’t fix', 'Known, and a deliberate choice'],
  ['fixed-elsewhere', 'Already fixed elsewhere', 'Fixed in code that this page hasn’t picked up'],
];
let D = {};
const setDismissals = (remembered, run = []) => { D = {}; for (const d of remembered) D[d.check + '|' + d.selector] = { ...d, remember: true }; for (const d of run) D[d.check + '|' + d.selector] = { ...d, remember: false }; };
setDismissals(A.dismissals);
const reasonLabel = (k) => REASONS.find((r) => r[0] === k)?.[1] ?? k;
const elName = (e) => (e?.label?.kind === 'page' ? 'The whole page' : e?.label?.text ? '“' + e.label.text + '”' : e?.label ? 'Unlabeled ' + e.label.kind : e?.selector ?? '');
const findingsNow = () => splitDismissed(A.findings, D);
// Kinds of finding on this page (D46). The kind word and the filter only
// show when there's more than one, so accessibility-only reports read as
// before.
const KINDS = [...new Set(A.findings.map((f) => f.source))];
const MULTI = KINDS.length > 1;
const kindWord = (k) => cap(k).replace('-', ' ');
// A rule-based pass is hidden when the same rule failed or couldn't decide
// elsewhere on the page (D25). Judged passes are about their own elements
// and always show.
const failedSomewhere = (f) => f.method === 'deterministic' && A.findings.some((g) => g.check === f.check && g.verdict !== 'pass' && g.method === 'deterministic');
// Elements marked not an issue, under their issue like Fix lists them
// (D42). Each marked issue gets its own id so it never collides with the
// issue still in Fix or Review.
function markedIssues(dismissed) {
  const by = new Map();
  for (const x of dismissed) (by.get(x.f) ?? by.set(x.f, []).get(x.f)).push(x);
  return [...by].map(([f, xs]) => ({ ...f, id: 'marked:' + f.id, base: f, elements: xs.map((x) => x.e), elementCount: xs.length, marks: xs }));
}
// Where a finding goes when it isn't marked: Fix or Review.
// The group an issue sits in: severity in Fix, why it needs a person in Review.
const groupOf = (tab, f) => (tab === 'fix' ? cap(f.impact ?? 'No rating') : f.confidence === null ? 'Rule couldn’t decide' : 'Below your ' + Math.round(S.t * 100) + '% threshold');
const bucketOf = (f) => (triage([f], S.t).review.length ? 'review' : 'fix');

async function api(method, body) {
  const r = await fetch('api/dismissals', { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The report server didn’t answer.');
  return r.json();
}

// ---- Close-up: the screenshot scaled and cropped around the element.
function drawCrop(box, name) {
  S.closeName = name;
  const c = document.querySelector('.crop');
  if (!c || !box) return;
  const W = c.clientWidth, H = c.clientHeight, pad = 90;
  const rw = Math.max(box.w + pad * 2, 420), rh = Math.max(box.h + pad * 2, 180);
  const scale = Math.min(W / rw, H / rh, 2);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const left = Math.min(0, Math.max(W - A.page.w * scale, W / 2 - cx * scale));
  const top = Math.min(0, Math.max(H - A.page.h * scale, H / 2 - cy * scale));
  // A background, not an oversized image, so nothing spills past the
  // close-up's edges (axe then reads the text below it as overlapped).
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', 'Close-up of ' + (S.closeName || 'the element') + ' on the page');
  Object.assign(c.style, { backgroundImage: `url("${A.page.screenshot}")`, backgroundSize: `${A.page.w * scale}px auto`, backgroundPosition: `${left}px ${top}px`, backgroundRepeat: 'no-repeat' });
  const x = Math.max(0, left + box.x * scale - 3), y = Math.max(0, top + box.y * scale - 3);
  const w = Math.min(W, left + (box.x + box.w) * scale + 3) - x, h = Math.min(H, top + (box.y + box.h) * scale + 3) - y;
  c.innerHTML = `<div class="hl" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`;
}

// ---- Page view: pins on the full screenshot. No numbers (D25).
function renderPins(layer, img, list, selectedId) {
  const scale = img.clientWidth / img.naturalWidth || 0;
  layer.innerHTML = '';
  const picked = list.find((f) => f.id === selectedId);
  if (picked?.scope === 'page') layer.innerHTML = '<div class="wholepage"><span>Whole page</span></div>';
  for (const f of list) {
    if (f.scope === 'page') continue;
    f.elements.forEach((e, j) => {
      if (!e.box) return;
      const on = f.id === selectedId;
      if (on) {
        const r = document.createElement('div');
        r.className = 'hl';
        Object.assign(r.style, { left: e.box.x * scale - 3 + 'px', top: e.box.y * scale - 3 + 'px', width: Math.max(e.box.w * scale, 8) + 6 + 'px', height: Math.max(e.box.h * scale, 8) + 6 + 'px' });
        layer.appendChild(r);
      }
      if (j > 0 && !on) return;
      const p = document.createElement('button');
      p.className = 'pin' + (on ? ' on' : '');
      p.setAttribute('aria-label', f.title);
      p.dataset.pin = f.id;
      Object.assign(p.style, { left: e.box.x * scale - 9 + 'px', top: e.box.y * scale - 9 + 'px' });
      layer.appendChild(p);
    });
  }
}

// ---- Top bar: threshold popover listing what it moves, and downloads (D17).
function updateTopBar(findings) {
  const t = triage(findings, S.t);
  const v = Math.round(S.t * 100) + '%';
  $('th-val').textContent = v;
  $('th-out').textContent = v;
  $('th').value = Math.round(S.t * 100);
  t.passed = t.passed.filter((f) => !failedSomewhere(f));
  for (const k of ['fix', 'review', 'passed']) $('m-' + k).textContent = t[k].length;
  const movable = findings.filter((f) => f.confidence !== null && f.confidence < 1);
  const cant = findings.filter((f) => f.confidence === null).length;
  $('judged').innerHTML =
    movable.map((f) => `<div><span>${esc(f.title)}</span><em class="${f.confidence < S.t ? 'in' : ''}">${pct(f.confidence)}% · ${f.confidence < S.t ? 'Review' : f.verdict === 'fail' ? 'Fix' : 'Passed'}</em></div>`).join('') +
    (cant ? `<div><span>Rule can’t decide (${cant})</span><em class="in">Always review</em></div>` : '') +
    (movable.length ? '' : '<div><span>Every other finding is rule-based, so the threshold doesn’t move it.</span></div>');
}

function csv() {
  const { active, dismissed } = findingsNow();
  const t = triage(active, S.t);
  // Keyed by the finding, not its id: a rule's pass and fail share an id.
  // A pass is left out when the same rule failed elsewhere, as in the list.
  const bucket = new Map([...t.fix.map((f) => [f, 'Fix']), ...t.review.map((f) => [f, 'Review']), ...t.passed.filter((f) => !failedSomewhere(f)).map((f) => [f, 'Passed'])]);
  const cols = ['Bucket', 'Kind', 'Title', 'Verdict', 'Confidence', 'Method', 'Impact', 'Owner', 'Standard', 'Elements', 'Measured', 'Marked not an issue', 'Fix', 'First element'];
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = active.filter((f) => bucket.has(f)).map((f) => [bucket.get(f), kindWord(f.source), f.title, f.verdict, f.confidence === null ? 'Can’t tell' : pct(f.confidence) + '%', f.method === 'deterministic' ? 'Rule-based' : 'Judgment', f.impact ?? '', f.owner, f.standard.join(' '), f.elementCount, rangeText(f) ?? '', dismissed.filter((x) => x.f.id === f.id).length || '', f.verdict === 'pass' ? '' : f.fix, f.elements[0] ? elName(f.elements[0]) + ' ' + f.elements[0].selector : '']);
  const lines = [cols, ...rows].map((r) => r.map(q).join(','));
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), download: A.fileStem + '.csv' });
  a.click();
  URL.revokeObjectURL(a.href);
}

// Measured contrast on the row: "3.1 to 4.49 : 1" (D24).
function rangeText(f) {
  const r = f.elements.map((e) => e.wrong?.ratio).filter(Boolean);
  if (!r.length) return null;
  const lo = Math.min(...r), hi = Math.max(...r);
  return lo === hi ? `${lo} : 1` : `${lo} to ${hi} : 1`;
}
const where = (f) => (f.scope === 'page' ? 'Whole page' : plural(f.elementCount, 'element') + (rangeText(f) ? ', ' + rangeText(f) : ''));
const metaLine = (f) => `<p class="meta-line">${[`<span class="sev-word ${SEV[f.impact] ?? 'min'}">${f.impact ? cap(f.impact) : 'No rating'}</span>`, esc(f.owner), ...(MULTI ? [kindWord(f.source)] : []), f.method === 'deterministic' ? 'Rule-based' : 'Judgment', ...f.standard.map(esc)].join('<span aria-hidden="true"> · </span>')}</p>`;
const whyInReview = (f) => (f.verdict === 'unsure' || f.confidence === null ? 'The rule can’t decide this one, so a person checks it.' : `${f.verdict === 'pass' ? 'Looks like a pass' : 'Looks like a problem'}, but only ${f.runs.agree} of ${f.runs.of} runs agree (${pct(f.confidence)}%), under your ${Math.round(S.t * 100)}% threshold.`);

// ---- Side list: one row component, grouped under collapsible headers (D25, D28).
function listHtml(items) {
  const row = (x) => `<div class="card${x.key === S.sel ? ' on' : ''}"><button class="li" data-key="${esc(x.key)}" aria-current="${x.key === S.sel}"><span class="li-t">${esc(x.title)}</span><span class="li-m">${x.meta.map(esc).join(' · ')}</span></button>${x.key === S.sel && x.f ? subsHtml(x.f) : ''}</div>`;
  const groups = [];
  for (const x of items) { const g = groups.find((y) => y.name === x.group); g ? g.items.push(x) : groups.push({ name: x.group, items: [x] }); }
  return groups.map((g, i) => {
    const key = S.tab + ':' + g.name, open = !S.closed.has(key), id = 'grp-' + S.tab + '-' + i;
    return `<section class="lg"><h2><button class="lg-toggle" data-group="${esc(key)}" aria-expanded="${open}" aria-controls="${id}">${CHEV}<span>${esc(g.name)}</span><span class="count">${g.items.length}</span></button></h2>` +
      `<div class="lis" id="${id}"${open ? '' : ' hidden'}>${g.items.map(row).join('')}</div></section>`;
  }).join('');
}

// ---- Right pane, issue first, then the element (D40): title and meta;
// why it's in Review; how to fix, who it affects, the rule link; then one
// Element section with everything about that element, down to its
// dismiss button (D31).
function confHtml(f) {
  if (f.method === 'judgment') return `<section class="sec"><h2>Confidence</h2><div class="conf"><div class="meter"><i style="width:${pct(f.confidence)}%"></i><b style="left:${Math.round(S.t * 100)}%"></b></div><strong>${pct(f.confidence)}%</strong></div><p class="small">${S.tab === 'review' ? whyInReview(f) : `${f.runs.agree} of ${f.runs.of} review runs agree.`}</p></section>`;
  // The rule couldn't decide: the title and the group already say so (D44).
  if (f.confidence === null) return '';
  return '';
}

// The open finding's elements, under its row in the side list (D38), in
// the order the data gives them (worst first for contrast, D24). The arrows beside
// "Element 1 of 7" step through the same order.
function subsHtml(f) {
  if (f.scope === 'page' || f.elements.length < 2) return '';
  // Kept short (D41): no quotes, no ratio, and the kind only when the
  // elements in this issue aren't all the same kind. The right pane has
  // the full name and the measurement.
  const mixed = new Set(f.elements.map((e) => e.label?.kind)).size > 1;
  const row = (e, i) => {
    const name = e.label?.text ? esc(e.label.text) + (mixed ? ` <span class="k">${esc(e.label.kind)}</span>` : '') : esc(elName(e));
    return `<button class="sub" data-el="${i}" aria-current="${i === S.el}"><span>${name}</span></button>`;
  };
  return `<div class="subs" role="group" aria-label="Elements in this finding">${f.elements.map(row).join('')}</div>`;
}

function elementBlock(f, e, page) {
  const isPage = f.scope === 'page';
  const many = f.elements.length > 1;
  const title = isPage ? 'Where' : many ? `Element ${S.el + 1} of ${f.elements.length}` : 'Element';
  const step = many ? `<span class="step"><button data-step="-1" aria-label="Previous element">${STEP(-1)}</button><button data-step="1" aria-label="Next element">${STEP(1)}</button></span>` : '';
  const seg = isPage ? '' : `<div class="seg" role="group" aria-label="View"><button data-view="close" aria-pressed="${S.view === 'close'}">Close-up</button><button data-view="page" aria-pressed="${S.view === 'page'}">Page</button></div>`;
  const visual = page ? `<div class="shot"><img id="img" src="${esc(A.page.screenshot)}" alt="Screenshot of the audited page"><div class="layer" id="layer"></div></div>` : '<div class="crop"></div>';
  const w = e.wrong;
  const name = isPage ? '<h3 class="elname">The whole page</h3>' : `<h3 class="elname">${esc(elName(e))}${e.label?.text ? ` <span>${esc(e.label.kind)}</span>` : ''}</h3>`;
  // A suggested reason (D32), measured like any judgment, under the sentence.
  const sug = e.suggest ? `<p class="suggest">Suggested: ${esc(reasonLabel(e.suggest.reason))}${e.suggest.why ? `. ${esc(e.suggest.why.replace(/\.$/, ''))}` : ''}. ${e.suggest.agree} of ${e.suggest.of} judges.</p>` : '';
  // For an image with no text alternative: which fix, alt="" or a drafted
  // description (D55). Never a dismissal.
  const sf = e.suggestFix;
  const fixLine = sf ? `<p class="suggest">${sf.fix === 'decorative' ? `Suggested fix: add alt="" so screen readers skip it. Decorative, ${sf.agree} of ${sf.of} judges.` : `Suggested alt text: “${esc(sf.alt)}”. ${sf.agree} of ${sf.of} judges say it needs one.`}</p>` : '';
  const changed = e.changed ? `<p class="note changed">Marked not an issue on ${esc(day(e.changed.at))} (${esc(reasonLabel(e.changed.reason))}). The element has changed since, so it’s back.</p>` : '';
  const checks = e.checks ?? [];
  const dev = `<details class="dev"><summary>Developer detail</summary><p class="small mono">${esc(e.selector)}</p><pre>${esc(e.html)}</pre>${checks.length ? `<p class="small">Rule checks:</p><ul class="checks">${checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}</details>`;
  const partial = f.dismissedCount ? `<p class="partial">${plural(f.dismissedCount, 'other element')} marked not an issue. <button data-goto="passed" data-key="marked:${esc(f.id)}">See in Passed</button></p>` : '';
  return `<section class="sec el"><div class="sec-head"><div class="el-title"><h2>${title}</h2>${step}</div><div class="sec-tools">${seg}</div></div>${visual}` +
    `<div class="el-body">${name}${w ? `<p class="wrong">${esc(w.text)}</p>` : ''}${sug}${fixLine}${changed}${dev}${partial}</div>${f.marks ? markedHtml(f) : dismissHtml(f)}</section>`;
}

function aboutHtml(f) {
  return `<section class="sec"><h2>${f.verdict === 'unsure' ? 'How to check' : 'How to fix'}</h2><p>${esc(f.fix)}</p></section>` +
    (f.whoItAffects ? `<section class="sec"><h2>Who it affects</h2><p>${esc(f.whoItAffects)}</p></section>` : '') +
    (f.helpUrl ? `<p class="ref"><a href="${esc(f.helpUrl)}" target="_blank" rel="noopener">Rule documentation: ${esc(f.check)}</a></p>` : '');
}

const openCmd = () => `<pre>${esc(A.openCommand)}</pre>`;
function dismissForm(f, e) {
  // A published demo (no project behind it) says so plainly.
  if (!S.live && !A.openCommand) return `<div class="dismiss readonly" id="dform"><h3>Not an issue</h3><p class="hint">This is a demo report. When you run Design Audit on your own pages, this is where you mark an element not an issue, with a reason, and it stays decided on later runs.</p><button type="button" class="btn" data-cancel>Close</button></div>`;
  if (!S.live) return `<div class="dismiss readonly" id="dform"><h3>Not an issue</h3><p class="hint">Opened this way, the report can’t save decisions. To mark elements not an issue, open it from the project with:</p>${openCmd()}<p class="hint">Decisions save to ${esc(A.dismissalsFile)}.</p><button type="button" class="btn" data-cancel>Close</button></div>`;
  const what = f.scope === 'page' ? 'this finding for the whole page' : 'this element: ' + esc(elName(e));
  // A confident suggestion (at or above the threshold) opens with its reason
  // picked; a person still marks each element (D32).
  const sure = e.suggest && e.suggest.confidence >= S.t ? e.suggest.reason : null;
  const pick = e.changed?.reason ?? sure;
  return `<form class="dismiss" id="dform" novalidate>
    <h3>Not an issue</h3>
    <p class="hint">Marks ${what} as not an issue. It moves to Passed, where anyone can see why and undo it.${sure && !e.changed ? ` ${esc(reasonLabel(sure))} is picked because ${e.suggest.agree} of ${e.suggest.of} judges suggested it.` : ''}</p>
    <fieldset class="reasons"><legend>Why isn’t it an issue?</legend>
      ${REASONS.map(([k, l, d]) => `<label><input type="radio" name="reason" value="${k}"${k === pick ? ' checked' : ''}><span>${l}<small>${d}</small></span></label>`).join('')}
    </fieldset>
    <textarea name="note" placeholder="Add a note (optional)" aria-label="Note (optional)">${esc(e.changed?.note ?? '')}</textarea>
    <div class="foot">
      <label><input type="checkbox" name="remember" checked> Remember this on future runs <small>Comes back for review if the element changes</small></label>
      <span style="display:flex;gap:8px"><button type="button" class="btn" data-cancel>Cancel</button><button class="primary">Mark not an issue</button></span>
    </div>
  </form>`;
}
function dismissHtml(f) {
  const e = f.elements[S.el] ?? f.elements[0];
  const label = f.scope === 'page' ? 'This isn’t an issue' : f.elements.length > 1 ? `Element ${S.el + 1} isn’t an issue` : 'This element isn’t an issue';
  return S.form ? dismissForm(f, e) : `<div class="el-actions end"><button class="btn" data-dismiss="element">${label}</button></div>`;
}

// The decision for one marked element, where its dismiss button and form
// were, on the same surface as the form (D42).
function markedHtml(m) {
  const { d, key } = m.marks[S.el] ?? m.marks[0];
  const to = bucketOf(m.base) === 'review' ? 'Mark for review' : 'Mark for fix';
  const action = S.live
    ? `<div class="el-actions"><button class="btn" data-undo="${esc(key)}">${to}</button></div>`
    : A.openCommand ? `<p class="storage">To ${to.toLowerCase()}, open the report from the project with:</p>${openCmd()}` : '';
  return `<div class="dismiss marked"><h3>Marked not an issue</h3>` +
    `<dl class="record"><dt>Reason</dt><dd>${esc(reasonLabel(d.reason))}</dd>${d.note ? `<dt>Note</dt><dd>${esc(d.note)}</dd>` : ''}<dt>Marked by</dt><dd>${esc(d.by || 'Unknown')}, ${esc(day(d.at))}</dd><dt>Future runs</dt><dd>${d.remember ? 'Remembered. Comes back for review if the element changes.' : 'This report only.'}</dd></dl>` +
    `<p class="storage">${d.remember ? 'Saved in ' + esc(A.dismissalsFile) + '.' : 'Saved with this report only.'}</p>${action}</div>`;
}
// Under a marked issue's title: the rest of the issue, if any is left.
function leadOut(m, active) {
  const open = active.find((a) => a.id === m.base.id);
  if (!open) return '';
  const to = bucketOf(m.base);
  return `<p class="lead-out">${plural(open.elements.length, 'other element')} in this issue ${open.elements.length === 1 ? 'is' : 'are'} still in ${cap(to)}. <button data-goto="${to}" data-key="${esc(m.base.id)}">See in ${cap(to)}</button></p>`;
}

function passedDetail(f) {
  return `<div class="dhead"><h1>${esc(f.title)}</h1><p class="meta-line">Passed · ${f.scope === 'page' ? 'whole page' : plural(f.elementCount, 'element') + ' checked'}</p></div>` +
    (f.whoItAffects ? `<section class="sec"><h2>Who it helps</h2><p>${esc(f.whoItAffects)}</p></section>` : '') +
    `<section class="sec"><h2>How it was checked</h2><p>${f.method === 'deterministic' ? 'Rule-based check by axe-core ' + esc(A.axeVersion) : `Judgment call: ${f.runs.agree} of ${f.runs.of} review runs agree`}${f.standard.length ? ', ' + f.standard.map(esc).join(', ') : ''}.</p></section>` +
    (f.helpUrl ? `<p class="ref"><a href="${esc(f.helpUrl)}" target="_blank" rel="noopener">Rule documentation: ${esc(f.check)}</a></p>` : '');
}

const empty = (h, p) => `<div class="dhead"><h1>${h}</h1><p class="meta-line">${p}</p></div>`;

// Re-rendering replaces the buttons, so keyboard focus goes back to the
// same control afterwards.
function focusKey() {
  const a = document.activeElement;
  if (!a || a === document.body) return null;
  for (const k of ['data-key', 'data-group', 'data-el', 'data-step', 'data-view', 'data-undo', 'data-dismiss', 'data-pin', 'id']) if (a.hasAttribute(k)) return `[${k}="${CSS.escape(a.getAttribute(k))}"]`;
  return null;
}

function render() {
  const fk = focusKey();
  draw();
  if (fk && (!document.activeElement || document.activeElement === document.body)) document.querySelector(fk)?.focus({ preventScroll: true });
}

// The kind filter on the tab row (D46): a funnel opening a short menu, or
// a chip with the picked kind that clears it.
function drawKindFilter(active) {
  $('kf').hidden = !MULTI;
  if (!MULTI) return;
  const open = active.filter((f) => f.verdict !== 'pass');
  const n = (k) => open.filter((f) => !k || f.source === k).length;
  $('kf-btn').hidden = !!S.kind;
  $('kf-clear').hidden = !S.kind;
  if (S.kind) { $('kf-clear').innerHTML = `<span>${kindWord(S.kind)}</span><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>`; $('kf-clear').setAttribute('aria-label', `Showing ${kindWord(S.kind)} only. Show all findings`); }
  $('kf-menu').innerHTML = [['', 'All findings'], ...KINDS.map((k) => [k, kindWord(k)])].map(([k, l]) => `<button role="menuitemradio" aria-checked="${(S.kind ?? '') === k}" data-kind="${k}">${l}<span class="n">${n(k)}</span></button>`).join('');
}

function draw() {
  const all = findingsNow();
  const mine = (f) => !S.kind || f.source === S.kind;
  const active = all.active.filter(mine), dismissed = all.dismissed.filter((x) => mine(x.f));
  drawKindFilter(all.active);
  const out = triage(active, S.t);
  const passed = out.passed.filter((f) => !failedSomewhere(f));
  const marked = markedIssues(dismissed);
  $('n-fix').textContent = out.fix.length; $('n-review').textContent = out.review.length; $('n-passed').textContent = passed.length + marked.length;
  document.querySelectorAll('.tab').forEach((b) => { b.setAttribute('aria-selected', b.dataset.tab === S.tab); b.tabIndex = b.dataset.tab === S.tab ? 0 : -1; });
  updateTopBar(active);

  if (S.tab === 'passed') {
    const items = [
      ...marked.map((m) => ({ key: m.id, title: m.listTitle ?? m.title, f: m, meta: [...(m.listNote ? [m.listNote] : []), m.owner, plural(m.elements.length, 'element') + ' marked'], group: 'Marked not an issue' })),
      ...passed.map((f) => ({ key: f.id, title: f.title, meta: [f.scope === 'page' ? 'Whole page' : plural(f.elementCount, 'element') + ' checked'], group: 'Passed checks' })),
    ];
    if (!items.some((x) => x.key === S.sel)) { S.sel = items[0]?.key ?? null; S.el = 0; }
    const m = marked.find((y) => y.id === S.sel);
    if (m && S.el >= m.elements.length) S.el = 0;
    $('list').innerHTML = listHtml(items);
    const pf = passed.find((y) => y.id === S.sel);
    S.cur = m;
    if (m) showIssue(m, [m], leadOut(m, active));
    else $('detail').innerHTML = pf ? passedDetail(pf) : empty('Nothing passed yet', 'No checks passed on this page.');
    return;
  }

  const list = out[S.tab];
  if (!list.some((f) => f.id === S.sel)) { S.sel = list[0]?.id ?? null; S.el = 0; S.form = null; }
  $('list').innerHTML = list.length ? listHtml(list.map((f) => ({
    key: f.id, title: f.listTitle ?? f.title, f,
    meta: [...(MULTI && !S.kind ? [kindWord(f.source)] : []), ...(f.listNote ? [f.listNote] : []), f.owner, where(f), ...(f.method === 'judgment' ? [pct(f.confidence) + '% sure'] : [])],
    group: groupOf(S.tab, f),
  }))) : `<p class="empty">Nothing ${S.tab === 'fix' ? 'to fix' : 'to review'} at this threshold.</p>`;
  const f = list.find((x) => x.id === S.sel);
  if (!f) { $('detail').innerHTML = S.tab === 'fix' ? empty('Nothing to fix', `Nothing failed at your ${Math.round(S.t * 100)}% threshold.`) : empty('Nothing to review', 'Every finding cleared your threshold.'); return; }
  if (S.el >= f.elements.length) S.el = 0;
  S.cur = f;
  showIssue(f, list, '');
}

// The right pane for one issue, issue first, then the element (D40). Fix,
// Review and marked issues in Passed all read the same way.
function showIssue(f, pinList, under) {
  const e = f.elements[S.el] ?? f.elements[0];
  const isPage = f.scope === 'page';
  const page = isPage || S.view === 'page' || !e.box;
  $('detail').innerHTML = `<header class="dhead"><h1>${esc(f.title)}</h1>${metaLine(f)}${under}</header>` + (f.marks ? '' : confHtml(f)) + aboutHtml(f) + elementBlock(f, e, page);
  if (page) { const pins = () => renderPins($('layer'), $('img'), isPage ? [f] : pinList, S.sel); $('img').complete ? pins() : ($('img').onload = pins); }
  else drawCrop(e.box, elName(e));
  $('list').querySelector('.sub[aria-current=true]')?.scrollIntoView({ block: 'nearest' });
}

// ---- PDF: the whole report on paper, built when printing starts.
// The same five levels as the screen (D40, D43): page, tab, group, issue,
// element. Each issue reads issue first, then its elements.
function printHtml() {
  const { active, dismissed } = findingsNow();
  const out = triage(active, S.t);
  const passed = out.passed.filter((f) => !failedSomewhere(f));
  const marked = markedIssues(dismissed);
  const groups = (list, by, one) => {
    const g = new Map();
    for (const f of list) (g.get(by(f)) ?? g.set(by(f), []).get(by(f))).push(f);
    return [...g].map(([name, fs]) => `<h3>${esc(name)} <span class="count">${fs.length}</span></h3>${fs.map(one).join('')}`).join('');
  };
  // An element's what's-wrong only when it says something the issue
  // doesn't: when every element has the same sentence (can't-tell
  // contrast, unnamed buttons), the title already says it. Measurements
  // always show.
  const elements = (f) => {
    if (f.scope === 'page') return '';
    const same = new Set(f.elements.map((e) => e.wrong?.text)).size === 1;
    const li = (e) => `<li><b>${esc(elName(e))}</b>${e.wrong && (!same || e.wrong.ratio) ? ': ' + esc(e.wrong.text) : ''}</li>`;
    return `<p class="lbl">Elements</p><ul>${f.elements.slice(0, 15).map(li).join('')}${f.elements.length > 15 ? `<li>and ${f.elements.length - 15} more</li>` : ''}</ul>`;
  };
  const issue = (f) => `<div class="pf"><h4>${esc(f.title)}</h4>${metaLine(f)}<p class="meta-line">${esc(where(f))}</p>` +
    `<p class="lbl">${f.verdict === 'unsure' ? 'How to check' : 'How to fix'}</p><p>${esc(f.fix)}</p>` +
    (f.whoItAffects ? `<p class="lbl">Who it affects</p><p>${esc(f.whoItAffects)}</p>` : '') + elements(f) + '</div>';
  const markedIssue = (m) => `<div class="pf"><h4>${esc(m.title)}</h4>${metaLine(m)}<ul>${m.marks.map(({ e, d }) => `<li><b>${esc(elName(e))}</b>: ${esc(reasonLabel(d.reason))}${d.note ? '. ' + esc(d.note) : ''} (${esc(d.by || 'Unknown')}, ${esc(day(d.at))})</li>`).join('')}</ul></div>`;
  return `<h1>${esc(A.page.title || A.page.url)}</h1><p class="lede">${esc(A.page.url)} · audited ${esc(A.auditedAt)} · review threshold ${Math.round(S.t * 100)}%</p>` +
    `<p class="lede">${out.fix.length} to fix, ${out.review.length} for a person to review, ${passed.length} checks passed${marked.length ? ', ' + plural(marked.length, 'issue') + ' with elements marked not an issue' : ''}.</p>` +
    `<h2>Fix</h2>${out.fix.length ? groups(out.fix, (f) => groupOf('fix', f), issue) : '<p>Nothing to fix.</p>'}` +
    (out.review.length ? `<h2>Review</h2>${groups(out.review, (f) => groupOf('review', f), issue)}` : '') +
    `<h2>Passed</h2>` +
    (marked.length ? `<h3>Marked not an issue <span class="count">${marked.length}</span></h3>${marked.map(markedIssue).join('')}` : '') +
    `<h3>Passed checks <span class="count">${passed.length}</span></h3><ul class="passed">${passed.map((f) => `<li>${esc(f.title)}</li>`).join('')}</ul>`;
}
addEventListener('beforeprint', () => { $('print').innerHTML = printHtml(); });

// ---- Events
$('list').addEventListener('click', (ev) => {
  const g = ev.target.closest('.lg-toggle');
  if (g) { S.closed.has(g.dataset.group) ? S.closed.delete(g.dataset.group) : S.closed.add(g.dataset.group); render(); return; }
  const sub = ev.target.closest('.sub');
  if (sub) { S.el = +sub.dataset.el; S.view = 'close'; S.form = null; render(); return; }
  const b = ev.target.closest('.li');
  if (!b) return;
  S.sel = b.dataset.key; S.el = 0; S.form = null; render();
});
$('detail').addEventListener('click', async (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.pin) { S.sel = t.dataset.pin; S.el = 0; render(); }
  else if (t.dataset.view) { S.view = t.dataset.view; render(); }
  else if (t.dataset.step) { const n = S.cur.elements.length; S.el = (S.el + Number(t.dataset.step) + n) % n; S.form = null; render(); }
  else if (t.dataset.dismiss) { S.form = 'element'; render(); $('dform')?.scrollIntoView({ block: 'nearest' }); $('dform')?.querySelector('input, button')?.focus(); }
  else if ('cancel' in t.dataset) { S.form = null; render(); document.querySelector('[data-dismiss]')?.focus(); }
  else if (t.dataset.undo) {
    try { const d = D[t.dataset.undo]; await api('DELETE', { check: d.check, selector: d.selector }); delete D[t.dataset.undo]; render(); $('list').querySelector('[aria-current=true]')?.focus(); }
    catch (err) { t.insertAdjacentHTML('afterend', `<p class="err" role="alert">${esc(err.message)}</p>`); }
  }
  else if (t.dataset.goto) { S.tab = t.dataset.goto; S.sel = t.dataset.key; S.el = 0; S.form = null; render(); }
});
$('detail').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target, fd = new FormData(form);
  form.querySelector('.err')?.remove();
  if (!fd.get('reason')) { form.querySelector('.reasons').insertAdjacentHTML('afterend', '<div class="err" role="alert">Pick a reason first.</div>'); form.querySelector('input[name=reason]').focus(); return; }
  const f = findingsNow().active.find((x) => x.id === S.sel);
  const e = f.elements[S.el] ?? f.elements[0];
  const remember = fd.get('remember') === 'on';
  try {
    const { entry } = await api('POST', { check: f.check, selector: e.selector, htmlHash: e.htmlHash, element: elName(e), reason: fd.get('reason'), note: fd.get('note'), remember, ...(e.suggest && { suggested: e.suggest }) });
    D[f.check + '|' + e.selector] = { ...entry, remember };
    S.form = null; S.el = 0; render();
    $('list').querySelector('[aria-current=true]')?.focus();
  } catch (err) {
    form.querySelector('.foot').insertAdjacentHTML('beforebegin', `<div class="err" role="alert">Couldn’t save: ${esc(err.message)}</div>`);
  }
});
$('detail').addEventListener('change', (ev) => { if (ev.target.name === 'reason') document.querySelector('.dismiss .err')?.remove(); });
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; S.sel = null; S.form = null; render(); }));
document.querySelector('.tabs').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const tabs = [...document.querySelectorAll('.tab')], i = tabs.findIndex((t) => t.dataset.tab === S.tab);
  const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
  next.click(); next.focus();
});

// Top bar popovers
const pops = [['th-btn', 'th-pop'], ['dl', 'dl-menu'], ['kf-btn', 'kf-menu']];
const closePops = (refocus) => pops.forEach(([b, p]) => { if (!$(p).hidden && refocus) $(b).focus(); $(p).hidden = true; $(b).setAttribute('aria-expanded', 'false'); });
pops.forEach(([b, p]) => $(b).addEventListener('click', (e) => { e.stopPropagation(); const open = $(p).hidden; closePops(); $(p).hidden = !open; $(b).setAttribute('aria-expanded', open); }));
document.querySelectorAll('.pop').forEach((p) => p.addEventListener('click', (e) => e.stopPropagation()));
document.addEventListener('click', () => closePops());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePops(true); });
$('th').addEventListener('input', (e) => { S.t = e.target.value / 100; render(); });
$('dl-pdf').addEventListener('click', () => { closePops(); window.print(); });
$('side-btn').addEventListener('click', () => {
  const off = document.querySelector('.app').classList.toggle('side-off');
  $('side-btn').setAttribute('aria-expanded', String(!off));
  $('side-btn').setAttribute('aria-label', off ? 'Show the list' : 'Hide the list');
  render();
});
$('kf-menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  closePops(); S.kind = b.dataset.kind || null; S.sel = null; S.el = 0; S.form = null; render(); document.querySelector('.detail').scrollTop = 0;
  (S.kind ? $('kf-clear') : $('kf-btn')).focus();
});
$('kf-clear').addEventListener('click', () => { S.kind = null; S.sel = null; S.el = 0; S.form = null; render(); document.querySelector('.detail').scrollTop = 0; $('kf-btn').focus(); });
$('dl-csv').addEventListener('click', () => { closePops(); csv(); });
addEventListener('resize', () => render());

render();
// Served by scripts/open-report.mjs: read the latest decisions and allow
// new ones. Opened from a file: stay read-only.
if (location.protocol.startsWith('http') && A.openCommand) {
  api('GET').then((r) => { S.live = true; setDismissals(r.remembered, r.run); render(); }).catch(() => {});
}
