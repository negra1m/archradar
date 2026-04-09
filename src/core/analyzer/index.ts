import { analyzeComplexity } from './complexityAnalyzer.js';
import { analyzeCoupling } from './couplingAnalyzer.js';
import { analyzeCircularDeps } from './circularDepsAnalyzer.js';
import { analyzeModularity } from './modularityAnalyzer.js';
import { AnalysisResult } from '../../types/index.js';

export async function run(projectPath: string): Promise<AnalysisResult> {
  const [complexity, coupling, circularDeps, modularity] = await Promise.all([
    analyzeComplexity(projectPath),
    analyzeCoupling(projectPath),
    analyzeCircularDeps(projectPath),
    analyzeModularity(projectPath),
  ]);

  return { complexity, coupling, circularDeps, modularity };
}
