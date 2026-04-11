import { Project, SyntaxKind, Node } from 'ts-morph';
import path from 'path';
import { GodComponentDetectionResult, GodComponentFile } from '../../types/index.js';

// Thresholds — a file has to exceed at least TWO of these to be flagged.
const LINE_THRESHOLD = 400;
const HOOK_THRESHOLD = 8;
const IMPORT_THRESHOLD = 15;
const JSX_RETURN_THRESHOLD = 4;

// Common React hook names we count as "hook usages".
const HOOK_NAMES = new Set([
  'useState',
  'useEffect',
  'useLayoutEffect',
  'useMemo',
  'useCallback',
  'useRef',
  'useContext',
  'useReducer',
  'useImperativeHandle',
  'useTransition',
  'useDeferredValue',
  'useId',
  'useSyncExternalStore',
]);

/**
 * Detect "god components" — oversized React components that accumulate too
 * many responsibilities. A component must exceed at least two of the
 * thresholds (lines, hook usage, imports, JSX returns) to be flagged.
 *
 * This is deliberately conservative — false positives annoy users more than
 * false negatives. Legitimate complex forms or dashboards will trip one
 * threshold but usually not two.
 */
export async function detectGodComponents(projectPath: string): Promise<GodComponentDetectionResult> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  project.addSourceFilesAtPaths([
    path.join(projectPath, '**/*.tsx'),
    path.join(projectPath, '**/*.jsx'),
    `!${path.join(projectPath, '**/node_modules/**')}`,
    `!${path.join(projectPath, '**/dist/**')}`,
    `!${path.join(projectPath, '**/.next/**')}`,
  ]);

  const suspects: GodComponentFile[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(projectPath, sourceFile.getFilePath());
    const fullText = sourceFile.getFullText();
    const lines = fullText.split('\n').length;
    const imports = sourceFile.getImportDeclarations().length;

    // Count hook calls (any CallExpression whose called name matches a known hook).
    let hookUsage = 0;
    sourceFile.forEachDescendant((node) => {
      if (node.getKind() !== SyntaxKind.CallExpression) return;
      const expr = (node as Node).getFirstChildByKind(SyntaxKind.Identifier);
      const name = expr?.getText();
      if (name && HOOK_NAMES.has(name)) hookUsage++;
    });

    // Count JSX return statements (return <foo />).
    let jsxReturns = 0;
    sourceFile.forEachDescendant((node) => {
      if (node.getKind() !== SyntaxKind.ReturnStatement) return;
      const text = node.getText();
      if (/return\s*\(\s*</.test(text) || /return\s*</.test(text)) {
        jsxReturns++;
      }
    });

    const reasons: string[] = [];
    if (lines > LINE_THRESHOLD) reasons.push(`${lines} lines`);
    if (hookUsage > HOOK_THRESHOLD) reasons.push(`${hookUsage} hook calls`);
    if (imports > IMPORT_THRESHOLD) reasons.push(`${imports} imports`);
    if (jsxReturns > JSX_RETURN_THRESHOLD) reasons.push(`${jsxReturns} JSX returns`);

    if (reasons.length >= 2) {
      suspects.push({
        file: filePath,
        lines,
        imports,
        hookUsage,
        jsxReturns,
        reasons,
      });
    }
  }

  // Rank by total "smell" (sum of reasons count — more reasons = worse).
  suspects.sort((a, b) => b.reasons.length - a.reasons.length || b.lines - a.lines);

  return {
    hasGodComponents: suspects.length > 0,
    suspects: suspects.slice(0, 20),
    thresholds: {
      lines: LINE_THRESHOLD,
      hooks: HOOK_THRESHOLD,
      imports: IMPORT_THRESHOLD,
      jsxReturns: JSX_RETURN_THRESHOLD,
    },
  };
}
