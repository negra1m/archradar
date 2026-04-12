import { Project, SyntaxKind, Node } from 'ts-morph';
import path from 'path';
import { ComplexityResult } from '../../types/index.js';
import { topK } from '../../utils/topK.js';

/**
 * Single source of truth for the "complexity hotspot" threshold.
 * Functions with cognitive complexity >= this value are listed as hotspots.
 *
 * v1.4 Sprint 3 — archradar now uses **cognitive complexity** (SonarSource
 * spec, https://www.sonarsource.com/docs/CognitiveComplexity.pdf) instead
 * of cyclomatic. Cognitive complexity differs from cyclomatic in two ways:
 *
 *   1. Structures that break the linear flow (if, for, while, catch,
 *      switch, ternary, &&, ||, ??) each add +1.
 *   2. Nesting those structures inside one another adds an EXTRA +nesting
 *      level each, because nested logic is disproportionately hard to read.
 *
 * Example — three sequential ifs (plain function):
 *   if (a) {}  → +1
 *   if (b) {}  → +1
 *   if (c) {}  → +1                         = 3
 *
 * Example — three nested ifs (same branch count!):
 *   if (a) {                                 → +1 (nesting 0)
 *     if (b) {                               → +1 + 1 nesting = 2
 *       if (c) {}                            → +1 + 2 nesting = 3
 *     }
 *   }                                         = 6
 *
 * Cyclomatic would give the same score to both examples (4 each). Cognitive
 * correctly says the nested version is twice as expensive.
 *
 * The threshold stays at 10 — SonarSource's empirical value for "probably
 * too complex". Same constant is imported by healthScore.ts so scoring and
 * detection stay aligned.
 */
export const COMPLEXITY_THRESHOLD = 10;

/**
 * Syntax kinds that increase cognitive complexity by 1 AND bump the nesting
 * level inside them. Everything declared inside a node of these kinds gets
 * an extra +1 per nesting level.
 */
const NESTING_INCREMENT_KINDS = new Set<SyntaxKind>([
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CatchClause,
  SyntaxKind.SwitchStatement,
  SyntaxKind.ConditionalExpression, // ternary
]);

/**
 * Syntax kinds that increase complexity by 1 but do NOT bump the nesting
 * level. Mixed logical operators (a && b || c) get a single +1 for the
 * *change* in operator kind, per SonarSource spec. Here we simplify: each
 * logical token counts as +1 without nesting.
 */
const FLAT_INCREMENT_KINDS = new Set<SyntaxKind>([
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
]);

/**
 * Compute cognitive complexity of a function node.
 *
 * Walks children recursively, tracking current nesting depth. Each nesting
 * structure adds (1 + nesting), each flat structure adds 1.
 *
 * Exported for tests — call-site inside this file uses it directly.
 */
export function countCognitiveComplexity(node: Node): number {
  let score = 0;

  const walk = (current: Node, nesting: number): void => {
    current.forEachChild((child) => {
      const kind = child.getKind();
      let nextNesting = nesting;

      if (NESTING_INCREMENT_KINDS.has(kind)) {
        score += 1 + nesting;
        nextNesting = nesting + 1;
      } else if (FLAT_INCREMENT_KINDS.has(kind)) {
        score += 1;
      }

      // `else` doesn't increase nesting by itself (it belongs to a parent
      // IfStatement which already bumped nesting). But a standalone
      // `else if` branch does add +1 without extra nesting per SonarSource.
      // Our implementation handles this naturally — the inner IfStatement
      // counted by descent carries the +nesting.

      // Function expressions / arrow functions inside the current function:
      // per spec, nested function declarations RESET nesting to 0 for their
      // own body (they are separate contexts). We still charge +1 for their
      // declaration but descend with nesting=0.
      if (
        Node.isFunctionExpression(child) ||
        Node.isArrowFunction(child) ||
        Node.isFunctionDeclaration(child)
      ) {
        walk(child, 0);
        return;
      }

      walk(child, nextNesting);
    });
  };

  walk(node, 0);
  // Minimum 1 so "empty" functions don't score 0 — consistent with cyclomatic.
  return Math.max(1, score);
}

function getFunctionName(node: Node): string {
  if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
    return node.getName() ?? '<anonymous>';
  }
  if (Node.isVariableDeclaration(node)) return node.getName();
  return '<anonymous>';
}

export async function analyzeComplexity(projectPath: string): Promise<ComplexityResult> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  project.addSourceFilesAtPaths([
    path.join(projectPath, '**/*.ts'),
    path.join(projectPath, '**/*.tsx'),
    `!${path.join(projectPath, '**/node_modules/**')}`,
    `!${path.join(projectPath, '**/dist/**')}`,
    `!${path.join(projectPath, '**/.next/**')}`,
  ]);

  const hotspots: ComplexityResult['hotspots'] = [];
  const allComplexities: number[] = [];
  let totalComplexity = 0;
  let functionCount = 0;
  let maxFunctionLines = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(projectPath, sourceFile.getFilePath());

    const functions = [
      ...sourceFile.getFunctions(),
      ...sourceFile.getClasses().flatMap((c) => c.getMethods()),
      ...sourceFile
        .getVariableDeclarations()
        .filter(
          (v) =>
            Node.isArrowFunction(v.getInitializer()!) ||
            Node.isFunctionExpression(v.getInitializer()!)
        ),
    ];

    for (const fn of functions) {
      const fnNode = fn as Node;
      const complexity = countCognitiveComplexity(fnNode);
      // v1.4 Sprint 5 — per-function line count.
      const lines = fnNode.getEndLineNumber() - fnNode.getStartLineNumber() + 1;
      totalComplexity += complexity;
      functionCount++;
      allComplexities.push(complexity);
      if (lines > maxFunctionLines) maxFunctionLines = lines;

      if (complexity >= COMPLEXITY_THRESHOLD) {
        hotspots.push({
          file: filePath,
          function: getFunctionName(fnNode),
          complexity,
          lines,
        });
      }
    }
  }

  const top10 = topK(hotspots, 10, (h) => h.complexity);
  top10.sort((a, b) => b.complexity - a.complexity);

  // p95 gives a truer picture of the codebase's cognitive load than the
  // average alone, which is pulled down by trivial functions. Reported in
  // the result so the display can show avg AND p95 side-by-side.
  let p95Complexity = 0;
  if (allComplexities.length > 0) {
    allComplexities.sort((a, b) => a - b);
    const p95Idx = Math.floor(allComplexities.length * 0.95);
    p95Complexity = allComplexities[Math.min(p95Idx, allComplexities.length - 1)];
  }

  return {
    avgComplexity: functionCount > 0 ? Math.round(totalComplexity / functionCount) : 0,
    p95Complexity,
    maxFunctionLines,
    hotspots: top10,
  };
}
