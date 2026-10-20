// Turns check results into findings with one shared shape, so later
// checks (usability, design system) slot into the same ranking and report.
//
// Finding:
//   id          stable id: source + check
//   source      'accessibility' | 'usability' | 'design-system'
//   check       the rule or check name
//   verdict     'fail' | 'pass' | 'unsure'
//   confidence  0-1, or null when the check itself cannot tell
//   method      'deterministic' | 'judgment'
//   impact      'critical' | 'serious' | 'moderate' | 'minor' | null
//   title, whoItAffects, fix   plain language
//   standard    e.g. ['WCAG 1.4.3']
//   scope       'element' | 'elements' | 'page'
//   owner       'Design' | 'Dev' | 'Content': who usually makes the change
//   elements    [{ selector, html, htmlHash, checks, box, label, wrong, reason }]
//               box: where it sits on the screenshot; label: its visible
//               text and kind; wrong: one plain sentence (with the measured
//               ratio for contrast); reason: why the rule couldn't decide
//   measured    contrast fails: { min, max, need }, the range on the row
//               undecided contrast is one finding per reason (D39), with
//               `reason` set and what to check as its fix
//   listTitle, listNote  a shorter title for the side list, with what it
//               dropped moved to the row's meta line (D41)
//   helpUrl     where the rule is documented

import { createHash } from 'node:crypto';
import { describe, ownerOf, plainWrong, reasonOf, axeLines, REASONS } from './plain-language.mjs';


// Rules about the whole page, not one element on it.
const PAGE_RULES = new Set(['html-has-lang', 'html-lang-valid', 'document-title', 'landmark-one-main', 'page-has-heading-one', 'bypass', 'meta-viewport', 'meta-viewport-large', 'meta-refresh']);

export function scopeOf(check, nodes) {
  if (PAGE_RULES.has(check) || nodes.some((n) => n.target?.join(' ') === 'html')) return 'page';
  return nodes.length > 1 ? 'elements' : 'element';
}

function wcagRefs(tags) {
  // axe tags criteria as 'wcag143' -> WCAG 1.4.3
  return tags
    .filter((t) => /^wcag\d{3,4}$/.test(t))
    .map((t) => {
      const d = t.slice(4);
      return `WCAG ${d[0]}.${d[1]}.${d.slice(2)}`;
    });
}

export const hashHtml = (html) => createHash('sha1').update(html).digest('hex').slice(0, 12);

// Every element, so a person can step through all of them (D21), in the
// order they'd want to: contrast fails worst first (D24), undecided ones
// carry their reason so they can be split into one finding each (D39). Passed rules keep only
// selector and code; the report never shows them one by one.
function elementsOf(rule, verdict, places) {
  const els = rule.nodes.map((n) => {
    const selector = n.target.join(' ');
    const e = { selector, html: n.html.length > 200 ? n.html.slice(0, 200) + '…' : n.html };
    if (verdict === 'pass') return e;
    const at = places[selector] ?? {};
    const reason = verdict === 'unsure' && rule.id === 'color-contrast' ? reasonOf(n, at.inSvg) : null;
    return { ...e, htmlHash: hashHtml(n.html), checks: axeLines(n), box: at.box ?? null, label: at.label ?? null, wrong: plainWrong(rule.id, n, reason), ...(reason && { reason }) };
  });
  if (els.some((e) => e.wrong?.ratio)) els.sort((a, b) => (a.wrong?.ratio ?? 99) - (b.wrong?.ratio ?? 99));
  return els;
}

function measuredOf(elements) {
  const r = elements.filter((e) => e.wrong?.ratio);
  if (!r.length) return null;
  return { min: r[0].wrong.ratio, max: r[r.length - 1].wrong.ratio, need: Math.max(...r.map((e) => e.wrong.need)) };
}

// places: selector -> { box, label, inSvg }, from checkAccessibility.
export function fromAxe(results, places = {}) {
  const build = (rule, verdict, elements = elementsOf(rule, verdict, places)) => ({
    // The same rule can fail on some elements and be undecided on others;
    // those are separate findings.
    id: `accessibility:${rule.id}${verdict === 'unsure' ? ':unsure' : ''}`,
    source: 'accessibility',
    check: rule.id,
    verdict,
    // A failed or passed axe rule is certain. An incomplete one is axe
    // saying it cannot tell, so it gets no number: a person decides.
    confidence: verdict === 'unsure' ? null : 1,
    method: 'deterministic',
    impact: rule.impact ?? null,
    ...describe(rule, verdict),
    standard: wcagRefs(rule.tags),
    scope: scopeOf(rule.id, rule.nodes),
    owner: ownerOf(rule.id),
    elementCount: rule.nodes.length,
    elements,
    measured: measuredOf(elements),
    helpUrl: rule.helpUrl,
  });
  // Undecided contrast splits by reason: one issue per reason, so Review
  // reads tab, issue, element like the other tabs (D39).
  const unsure = (rule) => {
    const all = elementsOf(rule, 'unsure', places);
    if (!all.some((e) => e.reason)) return [build(rule, 'unsure', all)];
    return Object.keys(REASONS).filter((k) => all.some((e) => e.reason === k)).map((key) => {
      const elements = all.filter((e) => e.reason === key);
      const f = build({ ...rule, nodes: rule.nodes.filter((n) => elements.some((e) => e.selector === n.target.join(' '))) }, 'unsure', elements);
      return { ...f, id: `${f.id}:${key}`, reason: key, title: REASONS[key].title, listTitle: REASONS[key].short, listNote: 'Contrast couldn’t be measured', fix: REASONS[key].check };
    });
  };
  return [
    ...results.violations.map((r) => build(r, 'fail')),
    ...results.incomplete.flatMap((r) => (r.id === 'color-contrast' ? unsure(r) : [build(r, 'unsure')])),
    ...results.passes.map((r) => build(r, 'pass')),
  ];
}
