import { Project } from 'ts-morph';
import path from 'path';
import { ModularityResult, ModularityViolation } from '../../types/index.js';

// Heuristics: UI files should not import from service/api layers directly in large numbers
const UI_PATTERNS = ['/components/', '/pages/', '/app/', '/views/'];
const LOGIC_PATTERNS = ['/services/', '/api/', '/store/', '/domain/', '/application/'];
const HOOK_PATTERNS = ['/hooks/', '/composables/'];

function isUiFile(filePath: string): boolean {
  return UI_PATTERNS.some((p) => filePath.includes(p));
}

function isLogicFile(filePath: string): boolean {
  return LOGIC_PATTERNS.some((p) => filePath.includes(p));
}

function isHookFile(filePath: string): boolean {
  return HOOK_PATTERNS.some((p) => filePath.includes(p));
}

export async function analyzeModularity(projectPath: string): Promise<ModularityResult> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  project.addSourceFilesAtPaths([
    path.join(projectPath, '**/*.ts'),
    path.join(projectPath, '**/*.tsx'),
    `!${path.join(projectPath, '**/node_modules/**')}`,
    `!${path.join(projectPath, '**/dist/**')}`,
    `!${path.join(projectPath, '**/.next/**')}`,
  ]);

  const issues: string[] = [];
  const violations: ModularityViolation[] = [];
  let uiImportingLogicDirectly = 0;
  let hooksImportingUi = 0;
  let totalUiFiles = 0;
  let totalHookFiles = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(projectPath, sourceFile.getFilePath()).replace(/\\/g, '/');

    const localImports = sourceFile
      .getImportDeclarations()
      .map((i) => i.getModuleSpecifierSourceFile()?.getFilePath() ?? '')
      .filter(Boolean)
      .map((p) => path.relative(projectPath, p).replace(/\\/g, '/'));

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

  // Modularity is only assessable if the project has UI or hook files.
  // A backend-only project gets `applicable=false` instead of a fake 100.
  // Deduction: up to -60 for UI violations, up to -40 for hook inversions.
  // Linear in the violation ratio — no arbitrary cap that destroys signal.
  const applicable = totalUiFiles > 0 || totalHookFiles > 0;
  let score = 100;
  if (totalUiFiles > 0) {
    score -= (uiImportingLogicDirectly / totalUiFiles) * 60;
  }
  if (totalHookFiles > 0) {
    score -= (hooksImportingUi / totalHookFiles) * 40;
  }

  return {
    modularityScore: applicable ? Math.round(Math.max(0, score)) : null,
    applicable,
    issues,
    violations,
  };
}
