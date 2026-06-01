import { analyzeComplexity } from './complexityAnalyzer.js';
import { analyzeCoupling } from './couplingAnalyzer.js';
import { analyzeCircularDeps } from './circularDepsAnalyzer.js';
import { analyzeModularity } from './modularityAnalyzer.js';
import { analyzeTechDebt } from './techDebtAnalyzer.js';
import { analyzeDataFlow } from './dataFlowAnalyzer.js';
import { createAnalysisContext } from './context.js';
import { AnalysisResult } from '../../types/index.js';

export async function run(projectPath: string): Promise<AnalysisResult> {
  // v1.5 — Parse the project ONCE and share it across the ts-morph analyzers.
  // Previously each of the four AST analyzers re-globbed and re-parsed the whole
  // tree. techDebt uses fast-glob (no AST) so it stays independent.
  const ctx = createAnalysisContext(projectPath);

  const [complexity, coupling, circularDeps, modularity, techDebt, dataFlow] = await Promise.all([
    analyzeComplexity(projectPath, ctx),
    analyzeCoupling(projectPath, ctx),
    analyzeCircularDeps(projectPath, ctx),
    analyzeModularity(projectPath, ctx),
    analyzeTechDebt(projectPath),
    analyzeDataFlow(projectPath, ctx),
  ]);

  return { complexity, coupling, circularDeps, modularity, techDebt, dataFlow };
}
