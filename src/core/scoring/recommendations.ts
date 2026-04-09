import { ScanResult, AnalysisResult } from '../../types/index.js';
import { topK } from '../../utils/topK.js';

interface Recommendation {
  priority: number;
  message: string;
}

export function generateRecommendations(scan: ScanResult, analysis: AnalysisResult): string[] {
  const recs: Recommendation[] = [];

  if (scan.files.criticalFiles.length > 0) {
    recs.push({
      priority: 1,
      message: `${scan.files.criticalFiles.length} file(s) above 300 lines detected. Consider splitting into smaller modules.`,
    });
  }

  if (scan.files.avgLinesPerFile > 200) {
    recs.push({
      priority: 2,
      message: `High average file size (${scan.files.avgLinesPerFile} lines). Prefer smaller, focused files.`,
    });
  }

  if (scan.dependencies.suspiciousDeps.length > 0) {
    recs.push({
      priority: 1,
      message: `Overlapping dependencies detected: ${scan.dependencies.suspiciousDeps[0]}. Consolidate to a single solution.`,
    });
  }

  if (scan.dependencies.heavyDeps.length > 0) {
    recs.push({
      priority: 3,
      message: `Heavy dependencies found: ${scan.dependencies.heavyDeps.join(', ')}. Evaluate lighter alternatives.`,
    });
  }

  if (!scan.structure.hasRecognizedPattern) {
    recs.push({
      priority: 2,
      message: 'No recognizable folder structure. Adopt a clear convention (feature-based, domain-driven, etc).',
    });
  }

  if (analysis.coupling.avgCoupling > 15) {
    recs.push({
      priority: 1,
      message: `High coupling (avg ${analysis.coupling.avgCoupling} imports/file). Reduce inter-module dependencies.`,
    });
  }

  if (analysis.complexity.hotspots.length > 0) {
    const worst = analysis.complexity.hotspots[0];
    recs.push({
      priority: 1,
      message: `High cyclomatic complexity in "${worst.function}" (${worst.file}, score ${worst.complexity}). Extract smaller functions.`,
    });
  }

  if (analysis.circularDeps.hasCycles) {
    recs.push({
      priority: 1,
      message: `${analysis.circularDeps.cycles.length} circular dependency(ies) detected. Restructure imports to break the cycles.`,
    });
  }

  if (analysis.modularity.issues.length > 0) {
    recs.push({
      priority: 2,
      message: analysis.modularity.issues[0],
    });
  }

  if (scan.files.totalFiles > 300) {
    recs.push({
      priority: 3,
      message: `Project has ${scan.files.totalFiles} files. Evaluate for dead code or extractable modules.`,
    });
  }

  const top5 = topK(recs, 5, (r) => -r.priority);
  top5.sort((a, b) => a.priority - b.priority);
  return top5.map((r) => r.message);
}
