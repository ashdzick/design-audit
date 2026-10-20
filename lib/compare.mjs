// Compares two audits of the same page, element by element: what a round
// of fixes fixed, what's still there, and anything new (fixing in the code,
// D58). An element counts as a problem when its finding fails or a person
// has to review it at the threshold; passes and suggestions don't count.

import { triage } from './triage.mjs';

// Every problem element: check, how to recognise it again, and its finding.
function problems(findings, threshold) {
  const t = triage(findings, threshold);
  const out = [];
  for (const [where, list] of [['fix', t.fix], ['review', t.review]])
    for (const f of list)
      for (const e of f.scope === 'page' ? [{ selector: 'html', label: { text: '' } }] : f.elements)
        out.push({ check: f.check, selector: e.selector, text: e.label?.text ?? '', title: f.title, where });
  return out;
}

// The same element on both sides: same check and selector, or, since a fix
// can shift an element's position in the code, same check and same
// visible text.
const same = (a, b) => a.check === b.check && (a.selector === b.selector || (a.text && a.text === b.text));

export function compareAudits(before, after, threshold) {
  const was = problems(before, threshold);
  const now = problems(after, threshold);
  return {
    fixed: was.filter((a) => !now.some((b) => same(a, b))),
    still: now.filter((b) => was.some((a) => same(a, b))),
    added: now.filter((b) => !was.some((a) => same(a, b))),
  };
}

// Grouped by issue title, for printing: [{ title, count }].
export function byTitle(list) {
  const m = new Map();
  for (const x of list) m.set(x.title, (m.get(x.title) ?? 0) + 1);
  return [...m].map(([title, count]) => ({ title, count }));
}
