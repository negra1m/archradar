import { Project } from 'ts-morph';
import path from 'path';
import { CircularDepsResult } from '../../types/index.js';

type Graph = Map<string, Set<string>>;

function buildGraph(projectPath: string, project: InstanceType<typeof Project>): Graph {
  const graph: Graph = new Map();

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(projectPath, sourceFile.getFilePath());
    if (!graph.has(filePath)) graph.set(filePath, new Set());

    for (const imp of sourceFile.getImportDeclarations()) {
      const moduleSpec = imp.getModuleSpecifierValue();
      if (!moduleSpec.startsWith('.')) continue; // skip node_modules

      const resolved = imp.getModuleSpecifierSourceFile();
      if (!resolved) continue;

      const resolvedPath = path.relative(projectPath, resolved.getFilePath());
      graph.get(filePath)!.add(resolvedPath);
    }
  }

  return graph;
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

    for (const neighbor of graph.get(node) ?? []) {
      dfs(neighbor);
    }

    stack.delete(node);
    stackArr.pop();
  }

  for (const node of graph.keys()) {
    dfs(node);
  }

  // deduplicate cycles
  const seen = new Set<string>();
  return cycles.filter((c) => {
    const key = [...c].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function analyzeCircularDeps(projectPath: string): Promise<CircularDepsResult> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  project.addSourceFilesAtPaths([
    path.join(projectPath, '**/*.ts'),
    path.join(projectPath, '**/*.tsx'),
    `!${path.join(projectPath, '**/node_modules/**')}`,
    `!${path.join(projectPath, '**/dist/**')}`,
    `!${path.join(projectPath, '**/.next/**')}`,
  ]);

  const graph = buildGraph(projectPath, project);
  const cycles = detectCycles(graph);

  // Convert Map<string, Set<string>> to Record<string, string[]> for serialization.
  const graphRecord: Record<string, string[]> = {};
  for (const [file, deps] of graph.entries()) {
    graphRecord[file] = [...deps];
  }

  return {
    hasCycles: cycles.length > 0,
    cycles: cycles.slice(0, 10),
    allCycles: cycles,
    graph: graphRecord,
  };
}
