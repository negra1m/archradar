// v1.5 — Shared analysis context.
//
// Before this, every analyzer created its own ts-morph `Project` and re-globbed
// + re-parsed the entire source tree: complexity, coupling, circular-deps,
// modularity, and data-flow each paid the full parse cost — ~5 redundant parses
// of the same files. The parse dominates scan time on real projects.
//
// AnalysisContext parses ONCE and hands the same `Project` (and a cached,
// POSIX-normalized source-file list) to every analyzer. Each analyzer keeps its
// own logic; it just stops re-parsing. The analyzers remain callable standalone
// (passing no context) so unit tests and any external callers are unaffected —
// in that case the analyzer builds a one-off context for itself.

import { Project } from 'ts-morph';
import path from 'path';

export interface AnalysisContext {
  projectPath: string;
  project: InstanceType<typeof Project>;
  /** All parsed source files (the ts-morph order, parsed once). */
  sourceFiles: ReturnType<InstanceType<typeof Project>['getSourceFiles']>;
  /** Project-relative, POSIX-normalized path for a source file's absolute path. */
  rel(absPath: string): string;
}

// The single glob every analyzer used to declare independently. Kept here so
// the inclusion/exclusion rules live in exactly one place.
function sourceGlobs(projectPath: string): string[] {
  return [
    path.join(projectPath, '**/*.ts'),
    path.join(projectPath, '**/*.tsx'),
    `!${path.join(projectPath, '**/node_modules/**')}`,
    `!${path.join(projectPath, '**/dist/**')}`,
    `!${path.join(projectPath, '**/.next/**')}`,
  ];
}

/** Parse the project once and build the shared context. */
export function createAnalysisContext(projectPath: string): AnalysisContext {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths(sourceGlobs(projectPath));
  const sourceFiles = project.getSourceFiles();
  return {
    projectPath,
    project,
    sourceFiles,
    rel: (absPath: string) => path.relative(projectPath, absPath).replace(/\\/g, '/'),
  };
}

/**
 * Resolve a context for an analyzer. When the orchestrator passes a shared
 * context, reuse it (no re-parse). When called standalone (tests, ad-hoc), build
 * a fresh one so the analyzer still works in isolation.
 */
export function resolveContext(projectPath: string, ctx?: AnalysisContext): AnalysisContext {
  if (ctx && ctx.projectPath === projectPath) return ctx;
  return createAnalysisContext(projectPath);
}
