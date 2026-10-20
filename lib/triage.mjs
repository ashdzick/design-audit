// Sorts findings by the person's review threshold (0-1).
//   fail at or above the threshold  -> fix
//   pass at or above the threshold  -> passed
//   anything below it, or unsure    -> review (a person looks)
// A low-confidence pass goes to review too: it may be a miss.
//
// Kept free of imports: the HTML report inlines this function so the
// slider in the page uses the same rule as the CLI.

export function triage(findings, threshold) {
  const out = { fix: [], review: [], passed: [] };
  for (const f of findings) {
    if (f.verdict === 'unsure' || f.confidence === null || f.confidence < threshold) out.review.push(f);
    else if (f.verdict === 'fail') out.fix.push(f);
    else out.passed.push(f);
  }
  return out;
}
