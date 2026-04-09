/**
 * Returns the top K elements by key value in O(n) expected time (quickselect).
 * Does not guarantee order among the K — sort the resulting K if needed.
 */
export function topK<T>(arr: T[], k: number, key: (item: T) => number): T[] {
  if (arr.length <= k) return arr.slice();

  const pivot = arr[Math.floor(Math.random() * arr.length)];
  const pivotVal = key(pivot);
  const higher = arr.filter((x) => key(x) > pivotVal);
  const equal  = arr.filter((x) => key(x) === pivotVal);
  const lower  = arr.filter((x) => key(x) < pivotVal);

  if (higher.length >= k) return topK(higher, k, key);
  if (higher.length + equal.length >= k) return [...higher, ...equal].slice(0, k);
  return [...higher, ...equal, ...topK(lower, k - higher.length - equal.length, key)];
}
