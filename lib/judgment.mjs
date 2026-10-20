// Judgment checks (M2): what rules can't tell, judged by Claude looking at
// the screenshot and the page's code (D4). Each check runs several times,
// independently (default 3, D48), and confidence is the share of runs that
// agree (D6). Inside Claude the runs are subagents; the tool itself calls no
// model (D47). It writes a brief per check into the report folder, each
// judge writes one run file, and mergeRuns() turns the runs into findings
// with the shared shape (lib/findings.mjs).
//
// A run file, judge/<check>.run-<n>.json:
//   { "check": "color-only", "verdict": "fail" | "pass",
//     "title": "Lead temperature is shown by color alone",   (fail only, optional)
//     "fix": "Put the word next to the dot ...",            (fail only, optional)
//     "elements": [{ "id": "c1", "wrong": "One plain sentence." }] }

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hashHtml } from './findings.mjs';
import { RULES, REASONS } from './plain-language.mjs';

// Rules about images with no text alternative (for the alt suggestions).
export const IMAGE_RULES = ['image-alt', 'role-img-alt', 'svg-img-alt', 'input-image-alt', 'area-alt', 'object-alt'];

export const DEFAULT_RUNS = 3;

// Judges type straight quotes; the report uses curly ones.
const curly = (t) => (t == null ? t : String(t).replace(/(\w)'(\w)/g, '$1’$2').replace(/'([^']*)'/g, '‘$1’').replace(/"([^"]*)"/g, '“$1”'));

export const CHECKS = {
  'color-only': {
    source: 'usability',
    title: 'Meaning is shown by color alone',
    ask: 'is any meaning shown by color alone?',
    passTitle: 'Meaning doesn’t rely on color alone',
    impact: 'serious',
    owner: 'Design',
    standard: ['WCAG 1.4.1'],
    whoItAffects: 'People with color blindness (about 1 in 12 men) and anyone on a washed-out screen can’t tell these apart.',
    fix: 'Put a word or a shape next to the color, and keep the color as a second cue.',
    question: 'Does any of these colored marks carry meaning (a status, a level, a category, right or wrong) that the page shows only through its color? A mark fails when two marks that mean different things differ only in color, with no word, shape, icon or text nearby that says what each one means. A mark passes when it is decoration, or when nearby text already says the same thing.',
    // How the brief lists each candidate, and what the report calls it.
    noun: 'marks',
    look: 'Look at it, then at each mark below where it sits.',
    columns: ['what', 'text nearby'],
    row: (x) => [`${x.shape}, ${x.color}`, x.near || '(no text nearby)'],
    label: (x) => ({ text: x.near, kind: x.shape }),
    titleHint: "what's shown by color alone, in plain words, e.g. 'Order status is shown by color alone'",
  },
  'placeholder-label': {
    source: 'usability',
    title: 'A field’s only label is its placeholder',
    ask: 'do these fields keep a label once someone types?',
    passTitle: 'Fields keep a label while you type',
    impact: 'moderate',
    owner: 'Design',
    standard: ['WCAG 3.3.2', 'WCAG 1.3.1'],
    whoItAffects: 'Once someone starts typing, the placeholder is gone and nothing says what the field is for. Screen reader users may hear only the placeholder, or nothing useful. Harder for people with memory or attention difficulties.',
    fix: 'Give the field a visible label that stays while typing, tied to it in the code, and keep the placeholder as an example.',
    question: 'Each field below has a placeholder and nothing in its code that labels it (no label tied to it, no aria-label, no aria-labelledby, no title). Does a person still know what the field is for once they have typed in it, and does the code give it a real name? A field fails when the placeholder is the only thing saying what it is for: either nothing visible stays once typing starts, or visible text nearby looks like a label but is not tied to the field, so screen readers do not get it as the name. A field passes when its purpose stays obvious without the placeholder and that is fine for everyone (for example a search box that is clearly a search box). Use the screenshot for what people see and the code given for what screen readers get.',
    noun: 'fields',
    look: 'Look at it, then at each field below where it sits, together with its code.',
    columns: ['field', 'placeholder', 'visible text near it', 'code'],
    row: (x) => [x.kind, `“${x.placeholder}”`, x.near || '(none)', '`' + x.tag.replace(/\|/g, '\\|') + '`'],
    // No text: the finding is that it has no name, so it reads "Unlabeled
    // text area" like the accessibility findings do.
    label: (x) => ({ text: '', kind: x.kind }),
    titleHint: "which field and what's missing, in plain words, e.g. 'The billing email field's only label is its placeholder'",
  },
};

// Runs in the page. Small colored marks with no text of their own: the
// usual way a status is shown by color alone (dots, pips, swatches).
// Icons and images are left out; they're another check.
export function findColorMarks() {
  const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
  const rgba = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const path = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n.id) { parts.unshift('#' + CSS.escape(n.id)); break; }
      const i = [...n.parentElement.children].indexOf(n) + 1;
      parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${i})`);
    }
    return parts.join(' > ');
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.width > 24 || r.height > 24) continue;
    if ((el.innerText || '').trim() || ['IMG', 'SVG', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el.tagName.toUpperCase()) || el.closest('svg') || el.querySelector('svg, img')) continue;
    const cs = getComputedStyle(el);
    const [cr, cg, cb, ca = 1] = rgba(cs.backgroundColor);
    if (!(ca > 0.5) || sat([cr / 255, cg / 255, cb / 255]) < 0.3) continue;
    const near = (el.parentElement?.innerText || '').replace(/\s+/g, ' ').trim();
    out.push({
      selector: path(el),
      box: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      color: cs.backgroundColor,
      shape: parseFloat(cs.borderRadius) >= Math.min(r.width, r.height) / 2 ? 'dot' : 'mark',
      near: near.length > 60 ? near.slice(0, 57) + '…' : near,
      html: el.outerHTML.length > 200 ? el.outerHTML.slice(0, 200) + '…' : el.outerHTML,
    });
  }
  return out.map((c, i) => ({ id: 'c' + (i + 1), ...c }));
}

// Runs in the page. Fields with a placeholder and nothing in the code that
// labels them: no tied or wrapping label, no aria-label or
// aria-labelledby, no title. Only the field's own tag goes in the brief,
// never the code around it.
export function findPlaceholderFields() {
  const path = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n.id) { parts.unshift('#' + CSS.escape(n.id)); break; }
      const i = [...n.parentElement.children].indexOf(n) + 1;
      parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${i})`);
    }
    return parts.join(' > ');
  };
  const SKIP = ['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color'];
  const out = [];
  for (const el of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    if (!el.placeholder.trim() || SKIP.includes((el.type || '').toLowerCase())) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const tied = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
    if (tied || el.getAttribute('aria-label')?.trim() || el.getAttribute('aria-labelledby')?.trim() || el.getAttribute('title')?.trim()) continue;
    // Visible text in the field's own box (card, field group, form row),
    // as a person would read it near the field.
    const box = el.closest('section, fieldset, form, .field, .card, li, td') || el.parentElement;
    const near = (box?.innerText || '').split('\n').map((t) => t.trim()).filter(Boolean).join(' · ');
    const tag = el.outerHTML.replace(/>[\s\S]*$/, '>');
    out.push({
      selector: path(el),
      box: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      kind: el.tagName === 'TEXTAREA' ? 'text area' : 'text field',
      placeholder: el.placeholder.trim(),
      near: near.length > 80 ? near.slice(0, 77) + '…' : near,
      tag,
      html: tag,
    });
  }
  return out.map((c, i) => ({ id: 'f' + (i + 1), ...c }));
}

// What each check judges, gathered while the page is open.
export const GATHER = { 'color-only': findColorMarks, 'placeholder-label': findPlaceholderFields };

// A second look at the contrast axe couldn't measure (M2, D26): one check
// per reason, so each brief is about one kind of background. Judges look
// at a close-up of each piece of text; their answers replace that text's
// "rule couldn't decide" entry.
const CONTRAST = {
  diagram: ['Text inside diagrams', 'they are part of a chart or illustration'],
  image: ['Text on images', 'they sit on an image'],
  gradient: ['Text on gradients', 'they sit on a gradient'],
  symbol: ['Symbols typed as text', 'they are symbols, not words'],
  overlap: ['Text under other elements', 'another element sits on top of them'],
  short: ['Single characters', 'they are too short to measure'],
  other: ['Text axe couldn’t measure', 'of how they are drawn'],
};
const isContrast = (check) => check.startsWith('contrast-');
const plural = (subject) => /^(Symbols|Single)/.test(subject);
function contrastConfig(check) {
  const reason = check.slice('contrast-'.length);
  const [subject, why] = CONTRAST[reason];
  return {
    source: 'accessibility', reason,
    title: `${subject} ${plural(subject) ? 'are' : 'is'} too low-contrast to read`,
    ask: 'can this text be read against what’s behind it?',
    passTitle: `${subject} ${plural(subject) ? 'read' : 'reads'} clearly`,
    impact: 'serious', owner: 'Design', standard: ['WCAG 1.4.3'],
    whoItAffects: RULES['color-contrast'].who,
    fix: RULES['color-contrast'].fix,
    question: `The rule couldn’t measure the contrast of these because ${why}. Open each close-up (twice the size people see it) and judge: can someone with low vision read it comfortably against what is behind it? A piece fails when it is hard to read anywhere along it: faint against its background, or lost in a busy image or gradient. It passes when it reads clearly. Judge readability only; whether it is decoration is a person’s call later.`,
    noun: 'pieces of text',
    look: 'Open each close-up below (use your image reading tool on the file).',
    columns: ['text', 'close-up'],
    row: (x) => [`“${x.text}”`, x.crop],
    label: (x) => x.label,
    titleHint: 'leave out',
  };
}
// Suggested reasons (D32): is a piece of low-contrast text part of a
// picture or decoration, which WCAG exempts? Judges look at a wide
// close-up of each. It makes no findings of its own: a majority answer
// becomes a suggestion on that element, and a person still decides.
const SUGGEST = {
  ask: 'is this text part of a picture, or text people need to read?',
  answer: (list) => `\`\`\`json
{
  "check": "suggest-reason",
  "elements": [{ "id": "${list[0].id}", "why": "one plain sentence: what picture or decoration it is part of" }]
}
\`\`\`

List only the pieces of text that are decoration or part of a picture. Plain language, no em dashes.
`,
  question: 'Each piece of text below is low in contrast, or its contrast couldn’t be measured. The contrast rule doesn’t apply to text that is pure decoration, or that is part of a picture with significant other visual content: a logo, a photo, a drawing, a chart image, or a screenshot or drawing of a product used as an illustration. Open each wide close-up (the text is in the middle) and judge: is this piece of text like that, so a reader loses nothing they need if they can’t read it? Or is it text people need to read: a label, a heading, a value, navigation, an instruction?',
  noun: 'pieces of text',
  look: 'Open each wide close-up below (use your image reading tool on the file); the text is in the middle of it.',
  columns: ['text', 'wide close-up'],
  row: (x) => [`“${x.text}”`, x.crop],
};
// Images with no text alternative: decorative (the fix is alt="", so
// screen readers skip it) or meaningful (the fix is a description, which
// judges draft). It changes the suggested fix, never dismisses: a
// decorative image with no alt still fails (D55).
const ALT = {
  ask: 'what should each of these images say to a screen reader?',
  question: 'Each image below has no text alternative, so screen readers announce it badly (often by its file name). Look at each one where it sits. Is it decorative: it adds nothing a reader needs, because it is a background, a flourish, a placeholder drawing, or a picture of something the text right next to it already names? Then the fix is an empty alt (alt="") so screen readers skip it. Or does it carry information a reader would miss? Then write the alt text you would give it: short, plain, what it shows that matters on this page, without starting with "image of".',
  noun: 'images',
  look: 'Open each close-up below (use your image reading tool on the file); the image is in the middle, with what sits around it.',
  columns: ['image', 'close-up'],
  row: (x) => [x.text || x.kind, x.crop],
  answer: (list) => `\`\`\`json
{
  "check": "suggest-alt",
  "elements": [{ "id": "${list[0].id}", "decorative": "true or false", "alt": "if not decorative: the alt text you would write" }]
}
\`\`\`

Answer for every image, decorative or not. Plain language, no em dashes.
`,
};
export const configOf = (check) => (check === 'suggest-reason' ? SUGGEST : check === 'suggest-alt' ? ALT : CHECKS[check] ?? (isContrast(check) ? contrastConfig(check) : null));
const SUGGESTION_CHECKS = ['suggest-reason', 'suggest-alt'];

// Every image missing a text alternative, with a close-up.
export function altCandidates(dir, findings, crops = {}) {
  const list = [];
  for (const f of findings) {
    if (!IMAGE_RULES.includes(f.check) || f.verdict !== 'fail') continue;
    for (const e of f.elements) {
      if (!crops.image?.[e.selector] || list.some((x) => x.selector === e.selector)) continue;
      const id = 'i' + (list.length + 1);
      const crop = resolve(dir, 'judge', 'images', id + '.png');
      mkdirSync(join(dir, 'judge', 'images'), { recursive: true });
      writeFileSync(crop, crops.image[e.selector]);
      list.push({ id, selector: e.selector, text: e.label?.text || '', kind: e.label?.kind || 'image', box: e.box, crop });
    }
  }
  return list.length ? { 'suggest-alt': list } : {};
}

// Runs -> a suggested fix per image: { fix: 'decorative' | 'describe',
// alt, agree, of, confidence }. Most judges calling it decorative means
// alt=""; otherwise (a tie included, since a missing description costs
// more) the shortest alt text a judge wrote.
export function mergeAlt(candidates, runs) {
  const n = runs.length;
  const out = {};
  if (!n) return out;
  for (const x of candidates) {
    const said = runs.map((r) => (r.elements ?? []).find((e) => e.id === x.id)).filter(Boolean);
    const isDeco = (e) => e.decorative === true || e.decorative === 'true';
    const deco = said.filter(isDeco).length;
    if (deco * 2 > n) { out[x.selector] = { fix: 'decorative', agree: deco, of: n, confidence: deco / n }; continue; }
    const alts = said.filter((e) => !isDeco(e) && e.alt).map((e) => curly(e.alt.trim())).sort((a, b) => a.length - b.length);
    if (alts.length) out[x.selector] = { fix: 'describe', alt: alts[0], agree: n - deco, of: n, confidence: (n - deco) / n };
  }
  return out;
}

export function altSuggestions(dir) {
  const file = join(dir, 'judge', 'checks.json');
  if (!existsSync(file)) return {};
  const c = JSON.parse(readFileSync(file, 'utf8')).checks.find((x) => x.check === 'suggest-alt');
  return c ? mergeAlt(c.candidates, readRuns(dir, 'suggest-alt')) : {};
}

// Every low-contrast or unmeasured piece of text with a wide close-up.
export function suggestCandidates(dir, findings, crops = {}) {
  const list = [];
  const seen = new Set();
  for (const f of findings) {
    if (f.check !== 'color-contrast' || f.verdict === 'pass') continue;
    for (const e of f.elements) {
      if (!crops.context?.[e.selector] || seen.has(e.selector)) continue;
      seen.add(e.selector);
      const id = 's' + (list.length + 1);
      const crop = resolve(dir, 'judge', 'context', id + '.png');
      mkdirSync(join(dir, 'judge', 'context'), { recursive: true });
      writeFileSync(crop, crops.context[e.selector]);
      list.push({ id, selector: e.selector, text: e.label?.text || '', box: e.box, crop });
    }
  }
  return list.length ? { 'suggest-reason': list } : {};
}

// Runs -> a suggestion per element where most judges called it decoration
// or part of a picture: { reason, why, agree, of, confidence }.
export function mergeSuggestions(candidates, runs) {
  const n = runs.length;
  const out = {};
  if (!n) return out;
  for (const x of candidates) {
    const said = runs.flatMap((r) => (r.elements ?? []).filter((e) => e.id === x.id));
    if (said.length * 2 <= n) continue;
    out[x.selector] = { reason: 'decorative', why: curly(said.find((e) => e.why)?.why ?? ''), agree: said.length, of: n, confidence: said.length / n };
  }
  return out;
}

export function suggestions(dir) {
  const file = join(dir, 'judge', 'checks.json');
  if (!existsSync(file)) return {};
  const c = JSON.parse(readFileSync(file, 'utf8')).checks.find((x) => x.check === 'suggest-reason');
  return c ? mergeSuggestions(c.candidates, readRuns(dir, 'suggest-reason')) : {};
}

// From the audit's "couldn't decide" contrast findings: the text to look
// at again, with its close-up written to judge/crops/. Hidden text has no
// close-up to judge and stays with a person.
export function contrastCandidates(dir, findings, crops = {}) {
  const out = {};
  let n = 0;
  for (const f of findings) {
    if (f.check !== 'color-contrast' || f.verdict !== 'unsure' || !CONTRAST[f.reason]) continue;
    const list = [];
    for (const e of f.elements) {
      if (!crops.detail?.[e.selector]) continue;
      const id = 't' + ++n;
      const crop = resolve(dir, 'judge', 'crops', id + '.png');
      mkdirSync(join(dir, 'judge', 'crops'), { recursive: true });
      writeFileSync(crop, crops.detail[e.selector]);
      list.push({ id, from: f.id, selector: e.selector, box: e.box, text: e.label?.text || '', label: e.label, html: e.html, htmlHash: e.htmlHash, crop });
    }
    if (list.length) out['contrast-' + f.reason] = list;
  }
  return out;
}

// One brief per check with something to judge, plus judge/checks.json for
// the merge. Returns the checks written.
export function writeBriefs(dir, candidates, { runs = DEFAULT_RUNS } = {}) {
  const jdir = join(dir, 'judge');
  const shot = resolve(dir, 'screenshot.png');
  const written = [];
  for (const [check, list] of Object.entries(candidates)) {
    if (!list.length) continue;
    const c = configOf(check);
    mkdirSync(jdir, { recursive: true });
    const rows = list.map((x) => `| ${[x.id, ...c.row(x), `${x.box.x}, ${x.box.y} (${x.box.w}×${x.box.h})`].join(' | ')} |`).join('\n');
    const head = ['id', ...c.columns, 'where'];
    // The heading asks; it never states the verdict before the judge looks.
    writeFileSync(join(jdir, `${check}.md`), `# Judge: ${c.ask}

You are one of ${runs} judges. Judge on your own: don't look for or read
other judges' answers.

**The page:** ${shot} (a full-page screenshot, 1 pixel = 1 CSS pixel).
${c.look}

**The question:** ${c.question}

**The ${c.noun}** (where: x, y on the screenshot from the top left, and size):

| ${head.join(' | ')} |
|${head.map(() => '---').join('|')}|
${rows}

**Answer** by writing one JSON file, \`${resolve(jdir, check)}.run-<your number>.json\`:

${c.answer ? c.answer(list) : `\`\`\`json
{
  "check": "${check}",
  "verdict": "fail or pass",
${c.titleHint === 'leave out' ? '' : `  "title": "if fail: ${c.titleHint}",
  "fix": "if fail: one or two plain sentences on what to change",
`}  "elements": [{ "id": "${list[0].id}", "wrong": "if fail: one plain sentence about this one" }]
}
\`\`\`

List only the ${c.noun} that fail. Plain language, no jargon, no em dashes.
`}`);
    written.push({ check, candidates: list });
  }
  if (written.length) writeFileSync(join(jdir, 'checks.json'), JSON.stringify({ runs, checks: written }, null, 2) + '\n');
  return written.map((w) => w.check);
}

export const readRuns = (dir, check) => {
  const jdir = join(dir, 'judge');
  if (!existsSync(jdir)) return [];
  return readdirSync(jdir)
    .filter((f) => f.startsWith(check + '.run-') && f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(jdir, f), 'utf8')));
};

// Runs -> one finding. The verdict is what most runs said (a tie counts as
// a fail: a miss costs more than a second look). Confidence is the share
// that said it (D6). A failing mark is listed when at least half the
// failing runs named it. The title and fix come from the agreeing judge
// with the shortest title.
export function mergeRuns(check, candidates, runs) {
  if (!runs.length) return null;
  const c = configOf(check);
  const fails = runs.filter((r) => r.verdict === 'fail');
  const verdict = fails.length * 2 >= runs.length ? 'fail' : 'pass';
  const agree = verdict === 'fail' ? fails.length : runs.length - fails.length;
  const byId = Object.fromEntries(candidates.map((x) => [x.id, x]));
  let elements = [];
  if (verdict === 'fail') {
    const votes = new Map();
    for (const r of fails) for (const e of r.elements ?? []) if (byId[e.id]) (votes.get(e.id) ?? votes.set(e.id, []).get(e.id)).push(e.wrong);
    // Marks at least half the failing runs named; if they agreed it fails
    // but not on which marks, every mark any of them named.
    let named = candidates.filter((x) => (votes.get(x.id)?.length ?? 0) * 2 >= fails.length);
    if (!named.length) named = candidates.filter((x) => votes.has(x.id));
    elements = named.map((x) => ({
      selector: x.selector,
      html: x.html,
      htmlHash: hashHtml(x.html),
      box: x.box,
      label: c.label(x),
      wrong: { text: curly(votes.get(x.id).find(Boolean)) ?? 'Shown by color alone.' },
    }));
  }
  // The shortest title any agreeing judge wrote (it reads best in the
  // side list), and the fix from that same judge.
  const lead = fails.filter((r) => r.title).sort((a, b) => a.title.length - b.title.length)[0] ?? {};
  return {
    id: `${c.source}:${check}`,
    source: c.source,
    check,
    verdict,
    confidence: agree / runs.length,
    runs: { agree, of: runs.length },
    method: 'judgment',
    impact: c.impact,
    title: verdict === 'fail' ? curly(lead.title) ?? c.title : c.passTitle,
    whoItAffects: c.whoItAffects,
    fix: (verdict === 'fail' && curly(lead.fix)) || c.fix,
    standard: c.standard,
    scope: elements.length > 1 ? 'elements' : 'element',
    owner: c.owner,
    elementCount: verdict === 'fail' ? elements.length : candidates.length,
    elements,
    measured: null,
    helpUrl: null,
  };
}

// Contrast runs merge per piece of text, since judges can differ on each:
// a piece fails when at least half the runs listed it. Pieces with the same
// verdict and the same agreement become one finding, so "3 of 3" and
// "2 of 3" land where the threshold puts them.
export function mergeContrast(check, candidates, runs) {
  if (!runs.length) return [];
  const c = configOf(check);
  const n = runs.length;
  const said = new Map();
  for (const r of runs) if (r.verdict === 'fail') for (const e of r.elements ?? []) (said.get(e.id) ?? said.set(e.id, []).get(e.id)).push(e.wrong);
  const groups = new Map();
  for (const x of candidates) {
    const v = said.get(x.id)?.length ?? 0;
    const verdict = v * 2 >= n && v > 0 ? 'fail' : 'pass';
    const agree = verdict === 'fail' ? v : n - v;
    const key = `${verdict}:${agree}`;
    const wrong = verdict === 'fail' ? curly(said.get(x.id).find(Boolean)) || 'Hard to read against what’s behind it.' : `${agree} of ${n} judges found it readable.`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push({ selector: x.selector, html: x.html, htmlHash: x.htmlHash, box: x.box, label: x.label, wrong: { text: wrong } });
  }
  return [...groups].map(([key, elements]) => {
    const [verdict, agree] = [key.split(':')[0], Number(key.split(':')[1])];
    return {
      id: `accessibility:color-contrast:judged:${c.reason}:${key}`,
      source: 'accessibility', check: 'color-contrast', verdict,
      confidence: agree / n, runs: { agree, of: n }, method: 'judgment',
      impact: c.impact, title: verdict === 'fail' ? c.title : c.passTitle,
      whoItAffects: c.whoItAffects, fix: c.fix, standard: c.standard,
      scope: elements.length > 1 ? 'elements' : 'element', owner: c.owner,
      elementCount: elements.length, elements, measured: null, reason: c.reason,
      helpUrl: null,
    };
  });
}

// Every check that has a brief and at least one run, as findings, and the
// "couldn't decide" elements the second look now covers.
export function judgedFindings(dir) {
  const file = join(dir, 'judge', 'checks.json');
  if (!existsSync(file)) return [];
  const { checks } = JSON.parse(readFileSync(file, 'utf8'));
  return checks.filter(({ check }) => !SUGGESTION_CHECKS.includes(check)).flatMap(({ check, candidates }) => {
    const runs = readRuns(dir, check);
    return isContrast(check) ? mergeContrast(check, candidates, runs) : [mergeRuns(check, candidates, runs)].filter(Boolean);
  });
}

// Selectors per "couldn't decide" finding that judges have now answered.
export function coveredUnsure(dir) {
  const file = join(dir, 'judge', 'checks.json');
  if (!existsSync(file)) return {};
  const out = {};
  for (const { check, candidates } of JSON.parse(readFileSync(file, 'utf8')).checks)
    if (isContrast(check) && readRuns(dir, check).length) for (const x of candidates) (out[x.from] ??= new Set()).add(x.selector);
  return out;
}
