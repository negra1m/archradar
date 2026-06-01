import { ScanResult, AnalysisResult } from '../../types/index.js';
import { topK } from '../../utils/topK.js';
import { maskPath } from '../../utils/pathMask.js';
import { getThresholdsForFramework } from '../../utils/calibrationLoader.js';

interface Recommendation {
  priority: number;
  message: string;
}

// v1.5 — Render up to `n` "path (detail)" locations so a recommendation
// points at the actual files, not just a count. "X files above 300 lines"
// becomes "...worst: admin/page.tsx (1141), dashboard/page.tsx (820)".
function topLocations<T>(
  items: T[],
  n: number,
  fmt: (item: T) => string
): string {
  const shown = items.slice(0, n).map(fmt);
  const extra = items.length - shown.length;
  return shown.join(', ') + (extra > 0 ? `, +${extra} more` : '');
}

export function generateRecommendations(scan: ScanResult, analysis: AnalysisResult): string[] {
  const recs: Recommendation[] = [];

  if (scan.files.criticalFiles.length > 0) {
    // Sort by size so the worst offenders are named first.
    const worst = [...scan.files.criticalFiles].sort((a, b) => b.lines - a.lines);
    const locs = topLocations(worst, 3, (f) => `${maskPath(f.path)} (${f.lines} lines)`);
    recs.push({
      priority: 1,
      message: `${scan.files.criticalFiles.length} file(s) above 300 lines. Split the worst first: ${locs}.`,
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

  // v1.5 — Anchor the coupling recommendation to the per-framework p90 and
  // name the worst files. "avg 16" is meaningless without "p90 React is 4".
  const fwk = getThresholdsForFramework(scan.framework.framework);
  const couplingAnchor = fwk.highCoupling;
  if (analysis.coupling.highCouplingFiles.length > 0) {
    const worst = [...analysis.coupling.highCouplingFiles].sort((a, b) => b.imports - a.imports);
    const locs = topLocations(worst, 3, (f) => `${maskPath(f.file)} (${f.imports})`);
    const anchorNote =
      fwk.source === 'community'
        ? `p90 for ${scan.framework.framework} is ${couplingAnchor}`
        : `typical threshold is ${couplingAnchor}`;
    recs.push({
      priority: 1,
      message: `${analysis.coupling.highCouplingFiles.length} file(s) over the coupling anchor (${anchorNote} imports). Worst: ${locs}. Reduce inter-module dependencies.`,
    });
  } else if (analysis.coupling.avgCoupling > 15) {
    recs.push({
      priority: 1,
      message: `High average coupling (${analysis.coupling.avgCoupling} imports/file). Reduce inter-module dependencies.`,
    });
  }

  if (analysis.complexity.hotspots.length > 0) {
    const worst = analysis.complexity.hotspots[0];
    recs.push({
      priority: 1,
      message: `High cognitive complexity in "${worst.function}" (${maskPath(worst.file)}, score ${worst.complexity}). Extract smaller functions.`,
    });
  }

  // v1.4 Sprint 4 #8 — Test culture recommendation.
  // Only fires for projects with enough source files to judge.
  if (scan.files.sourceFileCount >= 20) {
    if (scan.files.testFileCount === 0) {
      recs.push({
        priority: 1,
        message: `Zero test files detected across ${scan.files.sourceFileCount} source files. Adding even smoke tests for the critical paths would strengthen the score and reduce regression risk.`,
      });
    } else if (scan.files.testCoverageRatio < 0.1) {
      recs.push({
        priority: 2,
        message: `Low test culture: ${scan.files.testFileCount} test files for ${scan.files.sourceFileCount} source files (ratio ${scan.files.testCoverageRatio.toFixed(2)}). Mature projects typically run 0.3-0.5. Note: this counts files, not line coverage.`,
      });
    }
  }

  if (analysis.circularDeps.hasCycles) {
    const total = analysis.circularDeps.allCycles.length;
    // Name the shortest cycle — it's usually the easiest to break and the
    // clearest illustration of the problem.
    const shortest = [...analysis.circularDeps.allCycles].sort((a, b) => a.length - b.length)[0];
    const sample = shortest ? shortest.map(maskPath).join(' → ') : '';
    recs.push({
      priority: 1,
      message: `${total} circular dependency(ies). Start with the shortest: ${sample}. Restructure imports to break the cycle.`,
    });
  }

  if (analysis.modularity.issues.length > 0) {
    recs.push({
      priority: 2,
      message: analysis.modularity.issues[0],
    });
  }

  // v1.4 Sprint 6 — tech debt markers.
  if (analysis.techDebt.densityPerKLoc >= 3) {
    const top = analysis.techDebt.highDensityFiles[0];
    recs.push({
      priority: 2,
      message: `High tech debt density (${analysis.techDebt.densityPerKLoc.toFixed(1)}/KLOC). Worst offender: ${top ? maskPath(top.file) + ` (${top.count} markers)` : 'multiple files'}. Plan a debt sweep.`,
    });
  } else if (analysis.techDebt.byType['ts-nocheck'] > 0) {
    recs.push({
      priority: 2,
      message: `${analysis.techDebt.byType['ts-nocheck']} file(s) use @ts-nocheck. These files opt out of type checking entirely — prioritize restoring type safety.`,
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
