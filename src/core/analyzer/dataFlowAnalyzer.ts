// v1.4 Sprint 11 #3 — Data flow basics.
//
// NOT a full program analysis. This is a heuristic analyzer that catches
// three common patterns that cause the hardest bugs in real codebases:
//
//   1. Shared mutable state — a `let` or `var` that is EXPORTED from a
//      module and mutated from outside. Classic source of race conditions
//      and untraceable bugs. Example:
//          // counter.ts
//          export let count = 0;
//          // other.ts
//          import { count } from './counter';  count++;  // 🔴
//
//   2. Import-time side effects — top-level code in a module that does
//      more than declare (function call, mutation, console.log) AND that
//      module is imported by ≥3 others. Side effects at import time are
//      non-deterministic and break tree-shaking.
//
//   3. Global dict / mutable singleton — an export that is a Map/Set/Array
//      literal declared at top level. Anyone who imports it can mutate
//      shared state without trace.
//
// This is called "data flow basic" because:
//   - It does NOT track values across function boundaries (no inter-procedural)
//   - It does NOT prove anything — it flags candidates for review
//   - It does catch patterns that linters usually miss
//
// See DESIGN.md for the honest limitation: for rigorous data flow, use
// @typescript-eslint rules or a real static analyzer.

import { Node, SyntaxKind, VariableDeclarationKind, SourceFile } from 'ts-morph';
import { AnalysisContext, resolveContext } from './context.js';

export interface SharedMutable {
  file: string;
  name: string;
  kind: 'let' | 'var';
  initializerKind?: string;
}

export interface ImportTimeSideEffect {
  file: string;
  description: string;
  fanIn: number;
}

export interface MutableSingleton {
  file: string;
  name: string;
  type: 'Map' | 'Set' | 'Array' | 'Object';
}

export interface DataFlowResult {
  sharedMutables: SharedMutable[];
  importTimeSideEffects: ImportTimeSideEffect[];
  mutableSingletons: MutableSingleton[];
}

const EMPTY: DataFlowResult = {
  sharedMutables: [],
  importTimeSideEffects: [],
  mutableSingletons: [],
};

/**
 * Detect shared mutable exports in a single source file.
 */
function collectSharedMutables(
  sourceFile: SourceFile,
  relPath: string
): SharedMutable[] {
  const out: SharedMutable[] = [];

  for (const stmt of sourceFile.getVariableStatements()) {
    // Only exported statements matter — internal `let` is fine.
    if (!stmt.isExported()) continue;
    const decl = stmt.getDeclarationKind();
    if (decl === VariableDeclarationKind.Const) continue; // const is safe (sort of — see mutable singletons below)

    for (const v of stmt.getDeclarations()) {
      const initializer = v.getInitializer();
      out.push({
        file: relPath,
        name: v.getName(),
        kind: decl === VariableDeclarationKind.Let ? 'let' : 'var',
        initializerKind: initializer ? initializer.getKindName() : undefined,
      });
    }
  }

  return out;
}

/**
 * Detect const exports whose initializer is a mutable Map/Set/Array.
 * A `const config = new Map()` is still a shared mutable — const only
 * prevents reassignment, not mutation.
 */
function collectMutableSingletons(
  sourceFile: SourceFile,
  relPath: string
): MutableSingleton[] {
  const out: MutableSingleton[] = [];

  for (const stmt of sourceFile.getVariableStatements()) {
    if (!stmt.isExported()) continue;
    if (stmt.getDeclarationKind() !== VariableDeclarationKind.Const) continue;

    for (const v of stmt.getDeclarations()) {
      const initializer = v.getInitializer();
      if (!initializer) continue;

      // new Map() / new Set() calls
      if (Node.isNewExpression(initializer)) {
        const typeName = initializer.getExpression().getText();
        if (typeName === 'Map' || typeName === 'Set') {
          out.push({ file: relPath, name: v.getName(), type: typeName });
        }
      }
      // Array literal: export const cache = []
      if (Node.isArrayLiteralExpression(initializer)) {
        out.push({ file: relPath, name: v.getName(), type: 'Array' });
      }
      // Object literal at top level that's clearly meant as a mutable store
      // (has at least one property and is not a config-shape-only object).
      // Heuristic: look at names ending in `-store`, `-cache`, `-registry`.
      if (
        Node.isObjectLiteralExpression(initializer) &&
        /(Store|Cache|Registry|State|Globals?)$/i.test(v.getName())
      ) {
        out.push({ file: relPath, name: v.getName(), type: 'Object' });
      }
    }
  }

  return out;
}

/**
 * Detect top-level statements that are NOT declarations — function calls,
 * mutations, side effects. If the file is imported by ≥3 others, flag it.
 */
function collectImportTimeSideEffects(
  sourceFile: SourceFile,
  relPath: string,
  fanIn: number
): ImportTimeSideEffect[] {
  if (fanIn < 3) return []; // low-impact modules don't warrant the flag

  const out: ImportTimeSideEffect[] = [];

  for (const stmt of sourceFile.getStatements()) {
    const kind = stmt.getKind();

    // Allow: declarations, imports, exports, type-only stuff, interfaces
    if (
      Node.isImportDeclaration(stmt) ||
      Node.isExportDeclaration(stmt) ||
      Node.isExportAssignment(stmt) ||
      Node.isFunctionDeclaration(stmt) ||
      Node.isClassDeclaration(stmt) ||
      Node.isInterfaceDeclaration(stmt) ||
      Node.isTypeAliasDeclaration(stmt) ||
      Node.isEnumDeclaration(stmt) ||
      Node.isVariableStatement(stmt) ||
      Node.isModuleDeclaration(stmt) ||
      kind === SyntaxKind.EmptyStatement
    ) {
      continue;
    }

    // Only flag ExpressionStatements that are FUNCTION CALLS at top level
    // (e.g. `registerPlugin(...)`, `configure(...)`). Benign React patterns
    // like `X.displayName = 'Y'` or `Object.assign(X, ...)` are property
    // assignments, not function calls — ignoring those reduces false positives
    // in React/Next.js codebases where top-level assignments are ubiquitous.
    if (Node.isExpressionStatement(stmt)) {
      const expr = stmt.getExpression();
      // String literals: "use client", "use strict" — directive prologues.
      if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) {
        continue;
      }
      // Only flag actual function calls — CallExpression at top level.
      if (Node.isCallExpression(expr)) {
        out.push({
          file: relPath,
          description: expr.getText().slice(0, 60) + (expr.getText().length > 60 ? '…' : ''),
          fanIn,
        });
      }
    }
  }

  return out;
}

export async function analyzeDataFlow(
  projectPath: string,
  ctx?: AnalysisContext
): Promise<DataFlowResult> {
  // Parse failures degrade gracefully to an empty result rather than failing
  // the whole scan (e.g. a project with unparseable syntax).
  let sourceFiles: AnalysisContext['sourceFiles'];
  let rel: AnalysisContext['rel'];
  try {
    const resolved = resolveContext(projectPath, ctx);
    sourceFiles = resolved.sourceFiles;
    rel = resolved.rel;
  } catch {
    return EMPTY;
  }

  // Pre-pass: fan-in map (for side-effect flagging).
  const fanIn = new Map<string, number>();
  for (const sourceFile of sourceFiles) {
    for (const imp of sourceFile.getImportDeclarations()) {
      if (imp.isTypeOnly()) continue;
      const resolved = imp.getModuleSpecifierSourceFile();
      if (!resolved) continue;
      const r = rel(resolved.getFilePath());
      fanIn.set(r, (fanIn.get(r) ?? 0) + 1);
    }
  }

  const sharedMutables: SharedMutable[] = [];
  const importTimeSideEffects: ImportTimeSideEffect[] = [];
  const mutableSingletons: MutableSingleton[] = [];

  for (const sourceFile of sourceFiles) {
    const relPath = rel(sourceFile.getFilePath());

    sharedMutables.push(...collectSharedMutables(sourceFile, relPath));
    mutableSingletons.push(...collectMutableSingletons(sourceFile, relPath));
    importTimeSideEffects.push(
      ...collectImportTimeSideEffects(sourceFile, relPath, fanIn.get(relPath) ?? 0)
    );
  }

  // Stable order so the output (and the "worst offender" shown as [0]) is
  // identical across runs and OSes, not dependent on glob traversal order.
  sharedMutables.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  mutableSingletons.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  importTimeSideEffects.sort(
    (a, b) => a.file.localeCompare(b.file) || a.description.localeCompare(b.description)
  );

  return { sharedMutables, importTimeSideEffects, mutableSingletons };
}

/**
 * Feed data flow issues into the modularity score as extra violations.
 * Each shared mutable: -5, each import-time side effect: -3, each mutable
 * singleton: -3. Caps at -20 from data flow alone.
 */
export function dataFlowPenalty(result: DataFlowResult): number {
  const raw =
    result.sharedMutables.length * 5 +
    result.importTimeSideEffects.length * 3 +
    result.mutableSingletons.length * 3;
  return Math.min(20, raw);
}
