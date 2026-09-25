/**
 * Returns the top K elements by key value.
 *
 * v1.5 — Determinism fix. The previous implementation picked the quickselect
 * pivot with `Math.random()`, which made the *order* of the returned K unstable
 * across runs whenever keys tied. That order leaks into the report (hotspots,
 * coupling top-10) and into local history, so two scans of an unchanged project
 * could differ and surface a fake delta.
 *
 * Two changes:
 *   1. Median-of-three pivot — deterministic, still avoids quickselect's
 *      worst case on sorted input.
 *   2. Optional `tiebreak` comparator so callers that emit output can get a
 *      TOTAL order among the K (e.g. equal complexity → break by file path).
 *      When provided, the final K are sorted by (key desc, tiebreak asc).
 */
export function topK<T>(
  arr: T[],
  k: number,
  key: (item: T) => number,
  tiebreak?: (a: T, b: T) => number
): T[] {
  const finalize = (items: T[]): T[] => {
    if (!tiebreak) return items;
    // Total order: higher key first, ties resolved by the caller's comparator.
    return [...items].sort((a, b) => key(b) - key(a) || tiebreak(a, b));
  };

  if (arr.length <= k) return finalize(arr.slice());

  const select = (a: T[], n: number): T[] => {
    if (a.length <= n) return a.slice();
    // Median-of-three pivot: first, middle, last by key.
    const mid = a[Math.floor(a.length / 2)];
    const first = a[0];
    const last = a[a.length - 1];
    const trio = [first, mid, last].sort((x, y) => key(x) - key(y));
    const pivotVal = key(trio[1]);

    const higher = a.filter((x) => key(x) > pivotVal);
    const equal = a.filter((x) => key(x) === pivotVal);
    const lower = a.filter((x) => key(x) < pivotVal);

    if (higher.length >= n) return select(higher, n);
    if (higher.length + equal.length >= n) return [...higher, ...equal].slice(0, n);
    return [...higher, ...equal, ...select(lower, n - higher.length - equal.length)];
  };

  return finalize(select(arr, k));
}
