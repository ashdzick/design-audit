// Fixed ranking rules, so the same page always gives the same order:
// failures before unsure before passes, then impact, then how many
// elements are affected, then confidence, then check name.

const VERDICT = { fail: 0, unsure: 1, pass: 2 };
const IMPACT = { critical: 4, serious: 3, moderate: 2, minor: 1 };

export function rank(findings) {
  return [...findings].sort(
    (a, b) =>
      VERDICT[a.verdict] - VERDICT[b.verdict] ||
      (IMPACT[b.impact] ?? 0) - (IMPACT[a.impact] ?? 0) ||
      b.elementCount - a.elementCount ||
      (b.confidence ?? 0) - (a.confidence ?? 0) ||
      a.id.localeCompare(b.id),
  );
}
