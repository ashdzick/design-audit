// "Not an issue", one element at a time (D22, D29, D30, D31).
//
// Remembered dismissals live in the audited project, in
// .design-audit/dismissals.json, so they carry to the next run and can be
// committed with the code. One that isn't remembered applies to that report
// only and sits next to it, in run-dismissals.json.
//
// Entry: { page, check, selector, htmlHash, element, reason, note, by, at }
//   page      which page (a path inside the project, or the URL)
//   check     the rule; with selector, which element on the page
//   htmlHash  the element's code when it was marked. If the code changes,
//             the dismissal no longer applies and the element comes back
//             for review, with the old reason shown.
//   element   the element's name when it was marked, for people reading the file

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';

export const DIR = '.design-audit';
export const FILE = 'dismissals.json';
export const RUN_FILE = 'run-dismissals.json';

export const REASONS = {
  'decorative': 'Decorative',
  'not-applicable': 'Not applicable here',
  'accepted-risk': 'Accepted risk, won’t fix',
  'fixed-elsewhere': 'Already fixed elsewhere',
};

// A page is matched by where it lives: a path relative to the project for
// local files (so it survives moving the project), else the URL without
// its #fragment (so dzick.com and dzick.com/ are the same page).
export function pageKey(url, projectDir) {
  if (url.startsWith('file:')) {
    const path = fileURLToPath(url);
    const rel = relative(projectDir, path);
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return rel.split(sep).join('/');
    return path;
  }
  const u = new URL(url);
  u.hash = '';
  return u.href;
}

function readList(file) {
  if (!existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(data.dismissals) ? data.dismissals : [];
}

function writeList(file, list, header) {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...header, dismissals: list }, null, 2) + '\n');
}

const HEADER = { about: 'Elements marked "Not an issue" in Design Audit. Matched by page, rule and element; if an element\'s code changes, it comes back for review.', version: 1 };

export const projectFile = (projectDir) => join(projectDir, DIR, FILE);
export const loadRemembered = (projectDir) => readList(projectFile(projectDir));
export const loadRun = (reportDir) => readList(join(reportDir, RUN_FILE));

const same = (a, b) => a.page === b.page && a.check === b.check && a.selector === b.selector;

// Adds or replaces one element's dismissal. remember picks the file.
export function saveDismissal({ projectDir, reportDir }, entry, remember) {
  for (const [file, header] of [[projectFile(projectDir), HEADER], [join(reportDir, RUN_FILE), {}]]) {
    const list = readList(file).filter((d) => !same(d, entry));
    const keep = file === projectFile(projectDir) ? remember : !remember;
    if (keep) list.push(entry);
    if (keep || existsSync(file)) writeList(file, list, header);
  }
}

export function removeDismissal({ projectDir, reportDir }, key) {
  for (const [file, header] of [[projectFile(projectDir), HEADER], [join(reportDir, RUN_FILE), {}]]) {
    if (!existsSync(file)) continue;
    const list = readList(file);
    const next = list.filter((d) => !same(d, key));
    if (next.length !== list.length) writeList(file, next, header);
  }
}

// Who marked it: the project's git name, else the computer's user name.
export function whoAmI(projectDir) {
  try {
    const name = execFileSync('git', ['config', 'user.name'], { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (name) return name;
  } catch {}
  return userInfo().username;
}

// Splits findings into what's still open and what a person marked not an
// issue. byKey maps "check|selector" to a dismissal. An element whose code
// changed since it was marked stays open and carries the old decision as
// `changed`. Kept free of imports: the report inlines it, so the page and
// the CLI apply dismissals the same way.
export function splitDismissed(findings, byKey) {
  const active = [], dismissed = [];
  for (const f of findings) {
    if (f.verdict === 'pass') { active.push(f); continue; }
    const open = [];
    for (const e of f.elements) {
      const d = byKey[f.check + '|' + e.selector];
      if (d && d.htmlHash === e.htmlHash) dismissed.push({ f, e, d, key: f.check + '|' + e.selector });
      else open.push(d ? { ...e, changed: d } : e);
    }
    if (!open.length) continue;
    const gone = f.elements.length - open.length;
    active.push(gone || open.some((e) => e.changed) ? { ...f, elements: open, elementCount: open.length, dismissedCount: gone } : f);
  }
  return { active, dismissed };
}

export const keyed = (list) => Object.fromEntries(list.map((d) => [d.check + '|' + d.selector, d]));
