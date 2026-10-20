// Plain-language wording for the axe rules a design review hits most.
// Anything not listed falls back to axe's own help text.
// who: who is affected. fix: what to change, in design terms.

export const RULES = {
  'color-contrast': {
    title: 'Text is too low-contrast to read',
    unsureTitle: 'Text contrast couldn’t be measured',
    unsureFix: 'Check these by eye or with a color picker: the text sits on an image, gradient or overlapping element, so the contrast ratio could not be calculated.',
    who: 'People with low vision, and anyone on a phone in sunlight.',
    fix: 'Darken the text or lighten the background until it reaches 4.5:1 (3:1 for large text). Use a darker gray token for secondary text.',
  },
  'button-name': {
    title: 'Buttons have no name',
    who: 'Screen reader users hear only "button" and cannot tell what it does. Voice-control users cannot say its name to press it.',
    fix: 'Give every icon-only button an accessible name (aria-label="Call customer"), or show a visible text label next to the icon.',
  },
  'label': {
    title: 'Form fields have no label',
    who: 'Screen reader users cannot tell what to type. Placeholder text disappears once someone starts typing.',
    fix: 'Add a visible label tied to the field (label for=...). Placeholder text is not a label.',
  },
  'select-name': {
    title: 'Dropdowns have no label',
    who: 'Screen reader users hear a list of options with no question attached.',
    fix: 'Add a visible label tied to the dropdown.',
  },
  'image-alt': {
    title: 'Images have no text alternative',
    who: 'Screen reader users get nothing, or the file name read aloud.',
    fix: 'Add alt text that says what the image shows (alt="2024 Silver Crossover, front view"). Decorative images get alt="".',
  },
  'link-name': {
    title: 'Links have no text',
    who: 'Screen reader users hear "link" with no destination. Links lists in assistive tech show a blank.',
    fix: 'Give the link visible text or an aria-label that names where it goes.',
  },
  'aria-valid-attr-value': {
    title: 'ARIA attributes have invalid values',
    who: 'Assistive tech gets the wrong state (for example, cannot tell whether a panel is open).',
    fix: 'Use the values the attribute allows: aria-expanded is "true" or "false", never "yes" or "open".',
  },
  'duplicate-id-aria': {
    title: 'Two elements share an ID that a label points to',
    who: 'Screen readers may read the wrong label for a field or region.',
    fix: 'Make every ID unique. Duplicates usually come from a repeated component that hard-codes its ID.',
    // The rule can't tell whether the duplicate changes what a label
    // reads, so a person checks that, not the fix (D44).
    unsureFix: 'Find the element’s ID in Developer detail and search the page code for it. A label or aria-labelledby that points to a shared ID uses the first element with it, which may be the wrong one. Check that the label reads right with a screen reader. If it doesn’t, give each element its own ID.',
  },
  'html-has-lang': {
    title: 'The page does not declare its language',
    who: 'Screen readers may pronounce every word with the wrong voice and rules.',
    fix: 'Set the language on the page root (html lang="en").',
  },
  'heading-order': {
    title: 'Heading levels skip',
    who: 'Screen reader users navigate by headings; a jump from level 1 to level 4 reads as missing sections.',
    fix: 'Step headings down one level at a time. Pick the level by structure and style it with CSS.',
  },
  'page-has-heading-one': {
    title: 'The page has no main heading',
    who: 'Screen reader users jump to the first heading to learn where they are.',
    fix: 'Give the page one level-1 heading that names it (the lead name, on a lead view).',
  },
  'landmark-one-main': {
    title: 'The page has no main region',
    who: 'Screen reader and keyboard users cannot skip straight to the content.',
    fix: 'Wrap the primary content in a main element.',
  },
  'region': {
    title: 'Some content sits outside any page region',
    who: 'Screen reader users who move by region skip over it.',
    fix: 'Place all content inside header, nav, main, aside or footer.',
  },
  'aria-hidden-focus': {
    title: 'Hidden elements can still take keyboard focus',
    who: 'Keyboard users land on something a screen reader says is not there.',
    fix: 'Remove aria-hidden, or make everything inside it unfocusable.',
  },
  'nested-interactive': {
    title: 'Clickable things are nested inside other clickable things',
    who: 'Screen readers announce only the outer control; the inner one is unreachable.',
    fix: 'Pull the inner button or link out of the clickable card or row.',
  },
};

// verdict 'unsure' gets its own wording: the rule couldn't decide, so the
// title says what couldn't be checked rather than claiming a failure.
export function describe(rule, verdict) {
  const known = RULES[rule.id];
  const title = known?.title ?? rule.help;
  if (verdict === 'unsure') {
    return {
      title: known?.unsureTitle ?? `Couldn’t check automatically: ${/^[A-Z][a-z]/.test(title) ? title.charAt(0).toLowerCase() + title.slice(1) : title}`,
      whoItAffects: known?.who ?? null,
      fix: known?.unsureFix ?? known?.fix ?? rule.description,
    };
  }
  // A pass says what the page gets right (PASS_TITLES, else axe's help
  // line), never the failure title.
  if (verdict === 'pass') return { title: PASS_TITLES[rule.id] ?? rule.help, whoItAffects: known?.who ?? null, fix: known?.fix ?? rule.description };
  return { title, whoItAffects: known?.who ?? null, fix: known?.fix ?? rule.description };
}

// Who usually makes the change. Everything not listed is a code change.
const OWNER = { 'color-contrast': 'Design', 'image-alt': 'Content', 'link-name': 'Content', 'document-title': 'Content', 'role-img-alt': 'Content', 'svg-img-alt': 'Content', 'input-image-alt': 'Content', 'area-alt': 'Content', 'object-alt': 'Content', 'frame-title': 'Content', 'video-caption': 'Content', 'identical-links-same-purpose': 'Content', 'target-size': 'Design', 'link-in-text-block': 'Design', 'meta-viewport': 'Dev' };
export const ownerOf = (check) => OWNER[check] ?? 'Dev';

// A passed check says what the page gets right, in plain words. axe's own
// pass wording ("Ensure every ARIA button, link and menuitem has an
// accessible name") reads like a spec.
export const PASS_TITLES = {
  'area-alt': 'Image map areas have text alternatives',
  'aria-allowed-attr': 'ARIA attributes are allowed where they’re used',
  'aria-allowed-role': 'ARIA roles suit the elements they’re on',
  'aria-command-name': 'ARIA buttons, links and menu items have names',
  'aria-conditional-attr': 'ARIA attributes fit each element’s role',
  'aria-deprecated-role': 'No outdated ARIA roles',
  'aria-dialog-name': 'Dialogs have names',
  'aria-hidden-body': 'The page body isn’t hidden from screen readers',
  'aria-hidden-focus': 'Hidden elements can’t take keyboard focus',
  'aria-input-field-name': 'ARIA input fields have names',
  'aria-meter-name': 'Meters have names',
  'aria-progressbar-name': 'Progress bars have names',
  'aria-prohibited-attr': 'No ARIA attributes where they’re not allowed',
  'aria-required-attr': 'ARIA roles have the attributes they need',
  'aria-required-children': 'ARIA lists, menus and grids contain the right items',
  'aria-required-parent': 'ARIA items sit inside the right containers',
  'aria-roles': 'ARIA roles are real roles',
  'aria-text': 'Elements marked as text have nothing focusable inside',
  'aria-toggle-field-name': 'Toggles and checkboxes have names',
  'aria-tooltip-name': 'Tooltips have names',
  'aria-treeitem-name': 'Tree items have names',
  'aria-valid-attr-value': 'ARIA attributes have valid values',
  'aria-valid-attr': 'ARIA attributes are spelled correctly',
  'autocomplete-valid': 'Autocomplete values are ones browsers recognize',
  'avoid-inline-spacing': 'Text spacing can be adjusted by the reader',
  'blink': 'No blinking text',
  'button-name': 'Buttons have names',
  'bypass': 'Keyboard users can skip past repeated content',
  'color-contrast': 'Text has enough contrast to read',
  'definition-list': 'Definition lists are built correctly',
  'dlitem': 'Definition terms sit inside definition lists',
  'document-title': 'The page has a title',
  'duplicate-id-aria': 'IDs that labels point to are unique',
  'empty-heading': 'Headings have text',
  'empty-table-header': 'Table headers have text',
  'form-field-multiple-labels': 'Each form field has one label',
  'frame-focusable-content': 'Frames with focusable content can be reached by keyboard',
  'frame-title': 'Frames have titles',
  'frame-title-unique': 'Frame titles are unique',
  'heading-order': 'Heading levels step down in order',
  'html-has-lang': 'The page declares its language',
  'html-lang-valid': 'The page language is a real language code',
  'html-xml-lang-mismatch': 'The page’s two language settings agree',
  'identical-links-same-purpose': 'Links with the same name go to the same place',
  'image-alt': 'Images have text alternatives',
  'image-redundant-alt': 'Alt text doesn’t repeat nearby text',
  'input-button-name': 'Input buttons have names',
  'input-image-alt': 'Image buttons have text alternatives',
  'label': 'Form fields have labels',
  'label-content-name-mismatch': 'Visible labels match what screen readers hear',
  'label-title-only': 'Form fields aren’t labeled by a tooltip alone',
  'landmark-banner-is-top-level': 'The page header sits at the top level',
  'landmark-complementary-is-top-level': 'Sidebars sit at the top level',
  'landmark-contentinfo-is-top-level': 'The page footer sits at the top level',
  'landmark-main-is-top-level': 'The main region sits at the top level',
  'landmark-no-duplicate-banner': 'The page has one header region',
  'landmark-no-duplicate-contentinfo': 'The page has one footer region',
  'landmark-no-duplicate-main': 'The page has one main region',
  'landmark-one-main': 'The page has a main region',
  'landmark-unique': 'Page regions can be told apart',
  'link-in-text-block': 'Links in text stand out without relying on color',
  'link-name': 'Links have text',
  'list': 'Lists contain only list items',
  'listitem': 'List items sit inside lists',
  'marquee': 'No scrolling marquee text',
  'meta-refresh': 'The page doesn’t refresh or redirect on a timer',
  'meta-viewport': 'People can zoom the page',
  'meta-viewport-large': 'People can zoom the page a long way',
  'nested-interactive': 'No clickable things nested inside other clickable things',
  'no-autoplay-audio': 'No audio plays on its own',
  'object-alt': 'Embedded objects have text alternatives',
  'page-has-heading-one': 'The page has a main heading',
  'presentation-role-conflict': 'Decorative elements stay decorative',
  'region': 'All content sits inside a page region',
  'role-img-alt': 'Elements marked as images have text alternatives',
  'scope-attr-valid': 'Table header scopes are used correctly',
  'scrollable-region-focusable': 'Scrolling areas can be reached by keyboard',
  'select-name': 'Dropdowns have labels',
  'server-side-image-map': 'No server-side image maps',
  'skip-link': 'Skip links go somewhere',
  'svg-img-alt': 'SVG images have text alternatives',
  'tabindex': 'No elements jump the keyboard order',
  'table-duplicate-name': 'Table captions don’t repeat their summaries',
  'target-size': 'Touch targets are big enough, or far enough apart',
  'td-headers-attr': 'Table cells point to real headers',
  'th-has-data-cells': 'Table headers label real cells',
  'valid-lang': 'Language changes inside the page use real codes',
  'video-caption': 'Videos have captions',
};

// Why axe couldn't decide on a contrast element, as plain reasons. Each
// reason is its own finding in Review (D26, D39), with what a person
// should check in place of a fix. `short` is its title in the side list,
// where the group already says the rule couldn't decide (D41).
export const REASONS = {
  diagram: { short: 'Text inside diagrams', title: 'Contrast couldn’t be measured: text inside diagrams', check: 'This text is part of a chart or illustration. Check it reads clearly against what’s behind it. If it’s decoration with no meaning of its own, mark it not an issue as Decorative.' },
  image: { short: 'Text on images', title: 'Contrast couldn’t be measured: text on images', check: 'Check the text against the busiest part of the image behind it, with a color picker if it’s close. A solid or darkened backing behind the text makes it reliable.' },
  gradient: { short: 'Text on gradients', title: 'Contrast couldn’t be measured: text on gradients', check: 'Check the text against the part of the gradient closest to its own color. That’s where contrast is lowest.' },
  symbol: { short: 'Symbols, not words', title: 'Contrast couldn’t be measured: symbols, not words', check: 'Arrows and marks typed as characters. Check they’re readable, or that the words beside them carry the meaning on their own.' },
  overlap: { short: 'Text under another element', title: 'Contrast couldn’t be measured: text under another element', check: 'Another element sits on top of this text. Check the text where it’s covered, as people see it on the page.' },
  short: { short: 'Text too short to tell', title: 'Contrast couldn’t be measured: text too short to tell', check: 'Single characters. Check them by eye.' },
  hidden: { short: 'Hidden or off-screen text', title: 'Contrast couldn’t be measured: hidden or off-screen text', check: 'Check the text when it’s shown, for example on hover or in an open menu.' },
  other: { short: 'Other reasons', title: 'Contrast couldn’t be measured', check: 'Check these by eye or with a color picker.' },
};

// axe's reason code for an undecided contrast check -> a REASONS key.
// Overlapped or too-short text inside an SVG is diagram text.
export function reasonOf(node, inSvg) {
  const key = node.any?.[0]?.data?.messageKey;
  if ((key === 'bgOverlap' || key === 'shortTextContent') && inSvg) return 'diagram';
  return { bgImage: 'image', imgNode: 'image', bgGradient: 'gradient', nonBmp: 'symbol', pseudoContent: 'symbol', bgOverlap: 'overlap', elmPartiallyObscured: 'overlap', elmPartiallyObscuring: 'overlap', shortTextContent: 'short', outsideViewport: 'hidden', notScrolled: 'hidden', equalRatio: 'other' }[key] ?? 'other';
}

// What's wrong with one element, in one plain sentence built from the
// rule's own data (D29). Contrast carries the measured ratio and the
// requirement (D24). Unknown rules fall back to axe's first message.
const WRONG = {
  'button-name': 'No visible text, label or title, so this button has no name.',
  'link-name': 'No text or label, so this link has no name.',
  'image-alt': 'No alt text.',
  'input-image-alt': 'This image button has no alt text.',
  'label': 'No label tied to this field.',
  'select-name': 'No label tied to this dropdown.',
  'html-has-lang': 'The page root has no lang attribute.',
  'html-lang-valid': 'The page root’s lang attribute isn’t a real language code.',
  'document-title': 'The page has no title.',
  'heading-order': 'This heading skips a level.',
  'page-has-heading-one': 'The page has no level-1 heading.',
  'landmark-one-main': 'The page has no main region.',
  'region': 'This content sits outside any page region.',
  'autocomplete-valid': 'The autocomplete value isn’t one browsers recognize.',
  'duplicate-id-aria': 'Another element shares the id a label points to.',
  'nested-interactive': 'A clickable element sits inside another clickable element.',
  'aria-hidden-focus': 'Hidden from screen readers, but it can still take keyboard focus.',
  'list': 'This list holds something other than list items.',
  'listitem': 'This list item isn’t inside a list.',
  'frame-title': 'This frame has no title.',
  'meta-viewport': 'The page stops people from zooming.',
  'target-size': 'Too small to tap easily, and too close to its neighbors.',
};
const UNDECIDED = {
  diagram: 'Part of a diagram, so the contrast can’t be measured.',
  image: 'Sits on or contains an image, so the contrast can’t be measured.',
  gradient: 'Sits on a gradient, so the contrast can’t be measured.',
  symbol: 'A symbol rather than words, so the contrast can’t be judged.',
  overlap: 'Another element overlaps it, so the contrast can’t be measured.',
  short: 'Too short to tell whether it’s text, so the contrast can’t be judged.',
  hidden: 'Hidden or off screen when checked, so the contrast can’t be measured.',
};

export const axeLines = (node) =>
  (node.failureSummary ?? node.any?.[0]?.message ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !/^Fix (any|all) of the following/i.test(l));

export function plainWrong(check, node, reason) {
  if (check === 'color-contrast') {
    const d = node.any?.[0]?.data ?? {};
    if (d.contrastRatio && d.expectedContrastRatio) {
      const need = parseFloat(d.expectedContrastRatio);
      return { text: `${d.contrastRatio} : 1, needs ${need} : 1`, ratio: d.contrastRatio, need, fg: d.fgColor, bg: d.bgColor };
    }
    if (reason && UNDECIDED[reason]) return { text: UNDECIDED[reason] };
  }
  if (check === 'aria-valid-attr-value') {
    const m = axeLines(node).join(' ').match(/Invalid ARIA attribute values?: (\S+)/);
    return { text: m ? `${m[1]} isn’t an allowed value.` : 'An ARIA attribute has a value it doesn’t allow.' };
  }
  if (WRONG[check]) return { text: WRONG[check] };
  const first = axeLines(node)[0];
  return first ? { text: first } : null;
}
