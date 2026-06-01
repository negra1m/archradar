import { CircularDepsResult } from '../../types/index.js';
import { AnalysisContext, resolveContext } from './context.js';

type Graph = Map<string, Set<string>>;
type GraphBuildResult = { graph: Graph; typeOnlyFiltered: number };

function buildGraph(ctx: AnalysisContext): GraphBuildResult {
  const graph: Graph = new Map();
  let typeOnlyFiltered = 0;

  for (const sourceFile of ctx.sourceFiles) {
    const filePath = ctx.rel(sourceFile.getFilePath());
    if (!graph.has(filePath)) graph.set(filePath, new Set());

    for (const imp of sourceFile.getImportDeclarations()) {
      const moduleSpec = imp.getModuleSpecifierValue();
      if (!moduleSpec.startsWith('.')) continue; // skip node_modules

      // Filter type-only imports. A cycle between `import type` declarations
      // has no runtime meaning — TypeScript erases them during compilation.
      // Treating them as real cycles produced false positives in v1.3.
      if (imp.isTypeOnly()) {
        typeOnlyFiltered++;
        continue;
      }

      const resolved = imp.getModuleSpecifierSourceFile();
      if (!resolved) continue;

      const resolvedPath = ctx.rel(resolved.getFilePath());
      graph.get(filePath)!.add(resolvedPath);
    }
  }

  return { graph, typeOnlyFiltered };
}

// v1.5 — Rotate a cycle so it always starts at its lexicographically smallest
// node. The DFS emits the same cycle from whatever node it happened to enter
// first; canonicalizing makes "a→b→c→a" and "b→c→a→b" identical, so dedup is
// reliable and the emitted chain is stable across runs.
//
// Input includes the closing node (e.g. [a, b, c, a]); we drop it, rotate the
// open ring [a, b, c], then re-append the new start so the chain still reads
// as a loop.
function canonicalizeCycle(cycleWithClose: string[]): string[] {
  const ring = cycleWithClose.slice(0, -1);
  if (ring.length === 0) return cycleWithClose;
  let minIdx = 0;
  for (let i = 1; i < ring.length; i++) {
    if (ring[i].localeCompare(ring[minIdx]) < 0) minIdx = i;
  }
  const rotated = [...ring.slice(minIdx), ...ring.slice(0, minIdx)];
  return [...rotated, rotated[0]];
}

function detectCycles(graph: Graph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const stackArr: string[] = [];

  function dfs(node: string): void {
    if (stack.has(node)) {
      const cycleStart = stackArr.indexOf(node);
      cycles.push([...stackArr.slice(cycleStart), node]);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);
    stackArr.push(node);

    // Visit neighbors in a stable order so the DFS traversal — and thus the
    // set of cycles found — does not depend on Set insertion order.
    const neighbors = [...(graph.get(node) ?? [])].sort((a, b) => a.localeCompare(b));
    for (const neighbor of neighbors) {
      dfs(neighbor);
    }

    stack.delete(node);
    stackArr.pop();
  }

  // Iterate graph nodes in sorted order — removes the glob/readdir ordering
  // dependency from which cycles surface first.
  const roots = [...graph.keys()].sort((a, b) => a.localeCompare(b));
  for (const node of roots) {
    dfs(node);
  }

  // Canonicalize, then deduplicate.
  const seen = new Set<string>();
  const unique: string[][] = [];
  for (const c of cycles) {
    const canon = canonicalizeCycle(c);
    const key = canon.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(canon);
  }

  // Total order over the cycle list: shortest first (easiest to break), ties
  // by canonical chain. Guarantees `slice(0, 10)` is deterministic.
  unique.sort((a, b) => a.length - b.length || a.join('|').localeCompare(b.join('|')));
  return unique;
}

export async function analyzeCircularDeps(
  projectPath: string,
  ctx?: AnalysisContext
): Promise<CircularDepsResult> {
  const resolved = resolveContext(projectPath, ctx);
  const { graph, typeOnlyFiltered } = buildGraph(resolved);
  const cycles = detectCycles(graph);

  // Convert Map<string, Set<string>> to Record<string, string[]> for
  // serialization. Insert keys in sorted order and sort each dep list so the
  // JSON output is byte-identical across runs and OSes.
  const graphRecord: Record<string, string[]> = {};
  for (const file of [...graph.keys()].sort((a, b) => a.localeCompare(b))) {
    graphRecord[file] = [...graph.get(file)!].sort((a, b) => a.localeCompare(b));
  }

  return {
    hasCycles: cycles.length > 0,
    cycles: cycles.slice(0, 10),
    allCycles: cycles,
    graph: graphRecord,
    typeOnlyImportsFiltered: typeOnlyFiltered,
  };
}
