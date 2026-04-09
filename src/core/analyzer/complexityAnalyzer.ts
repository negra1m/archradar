import { Project, SyntaxKind, Node } from 'ts-morph';
import path from 'path';
import { ComplexityResult } from '../../types/index.js';
import { topK } from '../../utils/topK.js';

const COMPLEXITY_THRESHOLD = 10;

const COMPLEXITY_NODES = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.ElseKeyword,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CaseClause,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
]);

function countComplexity(node: Node): number {
  let count = 1; // base
  node.forEachDescendant((child) => {
    if (COMPLEXITY_NODES.has(child.getKind())) count++;
  });
  return count;
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
  let totalComplexity = 0;
  let functionCount = 0;

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
      const complexity = countComplexity(fn as Node);
      totalComplexity += complexity;
      functionCount++;

      if (complexity >= COMPLEXITY_THRESHOLD) {
        hotspots.push({
          file: filePath,
          function: getFunctionName(fn as Node),
          complexity,
        });
      }
    }
  }

  const top10 = topK(hotspots, 10, (h) => h.complexity);
  top10.sort((a, b) => b.complexity - a.complexity);

  return {
    avgComplexity: functionCount > 0 ? Math.round(totalComplexity / functionCount) : 0,
    hotspots: top10,
  };
}
