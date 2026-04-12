import { analyzeComplexity } from './complexityAnalyzer.js';
import { analyzeCoupling } from './couplingAnalyzer.js';
import { analyzeCircularDeps } from './circularDepsAnalyzer.js';
import { analyzeModularity } from './modularityAnalyzer.js';
import { analyzeTechDebt } from './techDebtAnalyzer.js';
import { analyzeDataFlow } from './dataFlowAnalyzer.js';
import { AnalysisResult } from '../../types/index.js';

export async function run(projectPath: string): Promise<AnalysisResult> {
  const [complexity, coupling, circularDeps, modularity, techDebt, dataFlow] = await Promise.all([
    analyzeComplexity(projectPath),
    analyzeCoupling(projectPath),
    analyzeCircularDeps(projectPath),
    analyzeModularity(projectPath),
    analyzeTechDebt(projectPath),
    analyzeDataFlow(projectPath),
  ]);

  return { complexity, coupling, circularDeps, modularity, techDebt, dataFlow };
}
