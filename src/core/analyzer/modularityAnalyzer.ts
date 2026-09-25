import { Node, SyntaxKind, SourceFile } from 'ts-morph';
import { ModularityResult, ModularityViolation } from '../../types/index.js';
import { AnalysisContext, resolveContext } from './context.js';

// Heuristics: UI files should not import from service/api layers directly in large numbers
const UI_PATTERNS = ['/components/', '/pages/', '/app/', '/views/'];
const LOGIC_PATTERNS = ['/services/', '/api/', '/store/', '/domain/', '/application/'];
const HOOK_PATTERNS = ['/hooks/', '/composables/'];

// v1.4 Sprint 7 — new detectors anchors
const STORE_PATH_HINTS = ['/store/', '/stores/', '/state/', '/global/', '/context/', '/contexts/'];
const STORE_FILENAME_HINTS = /(store|state|context|provider)\.tsx?$/i;

function isUiFile(filePath: string): boolean {
  return UI_PATTERNS.some((p) => filePath.includes(p));
}

function isLogicFile(filePath: string): boolean {
  return LOGIC_PATTERNS.some((p) => filePath.includes(p));
}

function isHookFile(filePath: string): boolean {
  return HOOK_PATTERNS.some((p) => filePath.includes(p));
}

function looksLikeStore(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (STORE_FILENAME_HINTS.test(normalized)) return true;
  return STORE_PATH_HINTS.some((p) => normalized.includes(p));
}

/**
 * v1.4 Sprint 7 #6 — detect prop-drilling (prop passed 3+ levels without use).
 *
 * Heuristic: a JSX attribute where the value is a simple identifier AND the
 * same identifier was destructured from this component's props parameter AND
 * is NOT used elsewhere in the component body. We flag that as "prop drilling
 * suspect". Not a full call-graph analysis — catches the obvious pattern.
 */
function countPropDrillingSuspects(sourceFile: SourceFile): number {
  let count = 0;

  sourceFile.forEachDescendant((node) => {
    // Look for function components: function declaration / arrow function
    // that takes a `props` parameter (either `props` identifier or
    // destructured `{ x, y }`).
    if (!Node.isFunctionDeclaration(node) && !Node.isArrowFunction(node) && !Node.isFunctionExpression(node)) {
      return;
    }

    const params = node.getParameters();
    if (params.length === 0) return;

    // Collect destructured prop names from the first parameter.
    const firstParam = params[0];
    const nameNode = firstParam.getNameNode();
    if (!Node.isObjectBindingPattern(nameNode)) return;

    const propNames = new Set<string>();
    for (const element of nameNode.getElements()) {
      const elName = element.getName();
      if (elName) propNames.add(elName);
    }
    if (propNames.size === 0) return;

    // Find JSX attributes whose initializer is a bare identifier that matches
    // a prop name — this is a candidate for "prop was forwarded".
    const body = node.getBody();
    if (!body) return;

    const forwarded = new Set<string>();
    const usedOutsideJsx = new Set<string>();

    body.forEachDescendant((child) => {
      // JSX attribute value `<Child foo={foo} />` — forwarded
      if (child.getKind() === SyntaxKind.JsxAttribute) {
        const attr = child.asKind(SyntaxKind.JsxAttribute);
        if (!attr) return;
        const init = attr.getInitializer();
        if (init && Node.isJsxExpression(init)) {
          const expr = init.getExpression();
          if (expr && Node.isIdentifier(expr)) {
            const txt = expr.getText();
            if (propNames.has(txt)) forwarded.add(txt);
          }
        }
      }
      // Any other use of the identifier counts as "used" — exclude from drilling
      if (Node.isIdentifier(child)) {
        const parentKind = child.getParent()?.getKind();
        if (
          parentKind !== SyntaxKind.JsxAttribute &&
          parentKind !== SyntaxKind.ObjectBindingPattern &&
          parentKind !== SyntaxKind.BindingElement
        ) {
          const txt = child.getText();
          if (propNames.has(txt)) usedOutsideJsx.add(txt);
        }
      }
    });

    // A prop that was forwarded AND never used outside JSX is a drilling
    // suspect — it just passes through.
    for (const name of forwarded) {
      if (!usedOutsideJsx.has(name)) count++;
    }
  });

  return count;
}

export async function analyzeModularity(
  projectPath: string,
  ctx?: AnalysisContext
): Promise<ModularityResult> {
  const { sourceFiles, rel: relPath } = resolveContext(projectPath, ctx);

  const issues: string[] = [];
  const violations: ModularityViolation[] = [];
  let uiImportingLogicDirectly = 0;
  let hooksImportingUi = 0;
  let totalUiFiles = 0;
  let totalHookFiles = 0;

  // v1.4 Sprint 7 — new counters
  let godStoreCount = 0;
  let contextOverconsumedCount = 0;
  let propDrillingCount = 0;

  // Pre-pass: build fan-in map for context/store-like files so we can
  // detect over-consumed contexts. Fan-in = how many other files import
  // this file.
  const fanIn = new Map<string, number>();
  for (const sourceFile of sourceFiles) {
    for (const imp of sourceFile.getImportDeclarations()) {
      if (imp.isTypeOnly()) continue;
      const resolved = imp.getModuleSpecifierSourceFile();
      if (!resolved) continue;
      const r = relPath(resolved.getFilePath());
      fanIn.set(r, (fanIn.get(r) ?? 0) + 1);
    }
  }

  for (const sourceFile of sourceFiles) {
    const filePath = relPath(sourceFile.getFilePath());

    const localImports = sourceFile
      .getImportDeclarations()
      .filter((i) => !i.isTypeOnly())
      .map((i) => i.getModuleSpecifierSourceFile()?.getFilePath() ?? '')
      .filter(Boolean)
      .map((p) => relPath(p));

    if (isUiFile(filePath)) {
      totalUiFiles++;
      const directLogicImports = localImports.filter(isLogicFile);
      if (directLogicImports.length > 3) {
        uiImportingLogicDirectly++;
        violations.push({
          file: filePath,
          type: 'ui-imports-logic',
          count: directLogicImports.length,
        });
      }
    }

    if (isHookFile(filePath)) {
      totalHookFiles++;
      const uiImports = localImports.filter(isUiFile);
      if (uiImports.length > 0) {
        hooksImportingUi++;
        violations.push({
          file: filePath,
          type: 'hook-imports-ui',
          count: uiImports.length,
        });
      }
    }

    // v1.4 Sprint 7 #6 — God store: file with >10 exported declarations
    // AND a store/state/context shape.
    if (looksLikeStore(filePath)) {
      const exportedCount = sourceFile.getExportedDeclarations().size;
      if (exportedCount > 10) {
        godStoreCount++;
        violations.push({
          file: filePath,
          type: 'god-store',
          count: exportedCount,
        });
      }

      // Context over-consumed: if this file exports a context AND fan-in > 5.
      // Heuristic: filename hints + high fan-in.
      const consumers = fanIn.get(filePath) ?? 0;
      if (consumers > 5) {
        contextOverconsumedCount++;
        violations.push({
          file: filePath,
          type: 'context-overconsumed',
          count: consumers,
        });
      }
    }

    // v1.4 Sprint 7 #6 — Prop drilling (UI files only, to keep cost down).
    if (isUiFile(filePath)) {
      const drills = countPropDrillingSuspects(sourceFile);
      if (drills > 0) {
        propDrillingCount += drills;
        violations.push({
          file: filePath,
          type: 'prop-drilling',
          count: drills,
        });
      }
    }
  }

  if (uiImportingLogicDirectly > 0) {
    issues.push(
      `${uiImportingLogicDirectly} UI file(s) import services/store directly (>3 imports). Use hooks as intermediaries.`
    );
  }

  if (hooksImportingUi > 0) {
    issues.push(
      `${hooksImportingUi} hook(s) import UI components — dependency inversion violation. Hooks should not depend on UI.`
    );
  }

  if (godStoreCount > 0) {
    issues.push(
      `${godStoreCount} god store(s) detected — files with >10 exports in store/state/context roles. Split by concern.`
    );
  }

  if (contextOverconsumedCount > 0) {
    issues.push(
      `${contextOverconsumedCount} context/store(s) imported by >5 files. Consider scoping or composing smaller contexts.`
    );
  }

  if (propDrillingCount > 0) {
    issues.push(
      `${propDrillingCount} prop drilling suspect(s) — props forwarded through components without being used locally.`
    );
  }

  // Modularity is only assessable if the project has UI or hook files.
  // A backend-only project gets `applicable=false` instead of a fake 100.
  //
  // v1.4 Sprint 7 deductions (layered on top of the original UI/hook score):
  //   each god-store:           -15
  //   each context-overconsumed: -10
  //   each 5 prop-drilling:      -5
  // Cap at 0.
  const applicable = totalUiFiles > 0 || totalHookFiles > 0;
  let score = 100;
  if (totalUiFiles > 0) {
    score -= (uiImportingLogicDirectly / totalUiFiles) * 60;
  }
  if (totalHookFiles > 0) {
    score -= (hooksImportingUi / totalHookFiles) * 40;
  }
  score -= godStoreCount * 15;
  score -= contextOverconsumedCount * 10;
  score -= Math.floor(propDrillingCount / 5) * 5;

  // Stable order so the violations list (and its serialization) is identical
  // across runs and OSes — they're pushed in source-file traversal order,
  // which depends on the glob.
  violations.sort(
    (a, b) => a.file.localeCompare(b.file) || a.type.localeCompare(b.type)
  );

  return {
    modularityScore: applicable ? Math.round(Math.max(0, score)) : null,
    applicable,
    issues,
    violations,
  };
}
