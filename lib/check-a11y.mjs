// Accessibility check: open the page in headless Chrome and run axe-core.
// Deterministic: no model involved. Returns axe's raw results, a
// full-page screenshot, and where each flagged element sits on it (with
// the name a person would call it) for the report's close-ups.

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { GATHER, IMAGE_RULES } from './judgment.mjs';

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

// WCAG 2.2 A and AA, plus axe's best-practice rules (headings, landmarks).
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

// Accepts a URL (http, https, file) or a path to a local HTML file.
export function toUrl(target) {
  if (/^(https?|file):\/\//i.test(target)) return target;
  const path = resolve(target);
  if (!existsSync(path)) throw new Error(`No such page: ${target}`);
  return pathToFileURL(path).href;
}

export async function checkAccessibility(target, { viewport = { width: 1280, height: 900 } } = {}) {
  const url = toUrl(target);
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    // Many real sites set a Content Security Policy that blocks injected
    // scripts, which is how axe gets in. Bypass it for the audit only.
    const page = await browser.newPage({ viewport, bypassCSP: true });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.addScriptTag({ content: AXE_SOURCE });
    const results = await page.evaluate(async (tags) => {
      // eslint-disable-next-line no-undef
      return await axe.run(document, { runOnly: { type: 'tag', values: tags } });
    }, AXE_TAGS);
    const places = await page.evaluate(locate, flaggedSelectors(results));
    // What the judgment checks look at, while the page is open (M2).
    const candidates = {};
    for (const [check, gather] of Object.entries(GATHER)) candidates[check] = await page.evaluate(gather);
    const screenshot = await page.screenshot({ fullPage: true });
    const title = await page.title();
    const crops = await closeUps(browser, url, viewport, results, places, pngSize(screenshot));
    return { url, title, axeVersion: results.testEngine.version, results, places, candidates, crops, screenshot, size: pngSize(screenshot) };
  } finally {
    await browser.close();
  }
}

// Close-ups of the text axe couldn't measure the contrast of, for the
// judges' second look (M2): each element with some room around it, at
// twice the size, since this is often 8px text. The page opens again at
// 2x in its own tab (a full-page screenshot ignores a scale change made
// on the open one), at the same width, so the boxes still line up.
// Two per piece of text: a tight one (detail) for judging the contrast, and
// a wide one (context) for judging whether it's part of a picture. One per
// image missing a text alternative, with room around it, for judging what
// it's for.
async function closeUps(browser, url, viewport, results, places, size) {
  const at = (r) => r.nodes.map((n) => [n.target.join(' '), places[n.target.join(' ')]?.box]).filter(([, b]) => b);
  const boxes = [...results.violations, ...results.incomplete].filter((r) => r.id === 'color-contrast').flatMap(at);
  const images = results.violations.filter((r) => IMAGE_RULES.includes(r.id)).flatMap(at);
  if (!boxes.length && !images.length) return { detail: {}, context: {}, image: {} };
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, bypassCSP: true });
  const out = { detail: {}, context: {}, image: {} };
  const shot = (box, pad) => {
    const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
    const clip = { x, y, width: Math.min(size.w - x, box.w + pad * 2), height: Math.min(size.h - y, box.h + pad * 2) };
    return clip.width >= 1 && clip.height >= 1 ? page.screenshot({ fullPage: true, clip }) : null;
  };
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    for (const [sel, box] of boxes) {
      if (out.detail[sel]) continue;
      out.detail[sel] = await shot(box, 24);
      out.context[sel] = await shot(box, 160);
    }
    for (const [sel, box] of images) out.image[sel] ??= await shot(box, 160);
  } finally {
    await page.close();
  }
  return out;
}

// Every element a failed or undecided rule points at. Passed rules can
// cover hundreds of elements and the report never shows them one by one.
function flaggedSelectors(results) {
  const out = new Set();
  for (const rule of [...results.violations, ...results.incomplete])
    for (const n of rule.nodes) if (n.target.every((t) => typeof t === 'string')) out.add(n.target.join(' '));
  return [...out];
}

// Runs in the page. For each selector: its box on the full-page
// screenshot, what a person would call it (visible text and kind), and
// whether it sits inside an SVG drawing.
function locate(selectors) {
  const KIND = { a: 'link', button: 'button', img: 'image', input: 'field', select: 'dropdown', textarea: 'field', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', text: 'diagram text', svg: 'graphic', html: 'page', label: 'label', li: 'list item', th: 'table header', td: 'table cell', nav: 'navigation', iframe: 'frame', video: 'video' };
  const ROLE = { button: 'button', link: 'link', img: 'image', checkbox: 'checkbox', tab: 'tab', textbox: 'field', combobox: 'dropdown', heading: 'heading', dialog: 'dialog' };
  const out = {};
  for (const sel of selectors) {
    let n;
    try { n = document.querySelector(sel); } catch { n = null; }
    if (!n) continue;
    const r = n.getBoundingClientRect();
    const box = r.width && r.height ? { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) } : null;
    const tag = n.tagName.toLowerCase();
    const raw = tag === 'html' ? '' : n.innerText || n.textContent || n.getAttribute('aria-label') || n.getAttribute('alt') || n.getAttribute('value') || n.getAttribute('placeholder') || '';
    const text = raw.replace(/\s+/g, ' ').trim();
    out[sel] = {
      box,
      label: { text: text.length > 60 ? text.slice(0, 57) + '…' : text, kind: ROLE[n.getAttribute('role')] ?? KIND[tag] ?? 'text' },
      inSvg: tag !== 'svg' && !!n.closest('svg'),
    };
  }
  return out;
}

// Width and height from the PNG header, so close-ups scale against the
// image actually captured.
export function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
