import {
  ScanResult,
  AnalysisResult,
  HealthScore,
  Grade,
  ScoreBreakdown,
  ScoreExplanation,
  ScoreComponentExplanation,
  ScorePenaltyExplanation,
  FileInfo,
} from '../../types/index.js';
import { HIGH_COUPLING_THRESHOLD } from '../analyzer/couplingAnalyzer.js';
import { COMPLEXITY_THRESHOLD } from '../analyzer/complexityAnalyzer.js';
import { techDebtPenalty } from '../analyzer/techDebtAnalyzer.js';
import { dataFlowPenalty } from '../analyzer/dataFlowAnalyzer.js';
import { getThresholdsForFramework } from '../../utils/calibrationLoader.js';

// ===== Continuous scoring curves =====
//
// Every component scores in [0..100]. The curves are continuous (no cliffs)
// and the thresholds are:
//   • file size / critical files  — derived from the median file size observed
//                                   across 97 calibration repos (~100 lines).
//   • coupling / complexity        — anchored to the HIGH_* constants exported
//                                   by the matching analyzer so detection and
//                                   scoring never contradict each other.
//   • dependencies                — capped penalty so 5 suspicious deps isn't
//                                   indistinguishable from 50.
//   • worstFile (v1.4 Sprint 2)   — dedicated penalty for the single worst
//                                   file, to combat averaging dilution.

// File size — 80 lines = 100, 500 = 20, smooth linear between.
function scoreFileSize(avgLines: number): number {
  if (avgLines <= 80) return 100;
  if (avgLines >= 500) return 20;
  const t = (avgLines - 80) / (500 - 80);
  return Math.round(100 - t * 80);
}

// Critical files — ratio 0 = 100, 30% = 20, smooth linear between.
function scoreCriticalFiles(criticalCount: number, totalFiles: number): number {
  if (totalFiles === 0) return 100;
  const ratio = criticalCount / totalFiles;
  if (ratio === 0) return 100;
  const pct = Math.min(ratio, 0.3) / 0.3;
  return Math.round(100 - pct * 80);
}

function scoreStructure(hasRecognizedPattern: boolean, folderCount: number): number {
  if (hasRecognizedPattern) return folderCount >= 3 ? 100 : 80;
  return folderCount >= 2 ? 40 : 20;
}

// Dependencies — each suspicious group costs 12, each heavy dep costs 4.
// Total penalty capped at 60 so the metric still discriminates between
// "a bit of mess" and "complete chaos".
function scoreDependencies(suspicious: number, heavy: number): number {
  const penalty = Math.min(60, suspicious * 12 + heavy * 4);
  return 100 - penalty;
}

// Coupling — anchored to the per-framework HIGH_COUPLING threshold derived
// from the calibration .fewserial (p90 of avg coupling for that framework).
// Falls back to the legacy HIGH_COUPLING_THRESHOLD constant if no community
// data exists for the framework.
//
// Smooth curve:
//   ≤ THRESHOLD/3  → 100 (well below the tail)
//   = THRESHOLD    → ~55 (borderline)
//   ≥ THRESHOLD*2  → 20  (definitive outlier)
function scoreCoupling(avgCoupling: number, framework: string): number {
  const fwk = getThresholdsForFramework(framework);
  const threshold = fwk.highCoupling || HIGH_COUPLING_THRESHOLD;
  const low = threshold / 3;
  const high = threshold * 2;
  if (avgCoupling <= low) return 100;
  if (avgCoupling >= high) return 20;
  const t = (avgCoupling - low) / (high - low);
  return Math.round(100 - t * 80);
}

// Component-level score for a single complexity value (cognitive).
//
// v1.4 Sprint 3 — Now scoring against cognitive complexity, which is
// typically 1.5-2x cyclomatic for real code. v1.4 Sprint 8 — anchor is
// per-framework: derived from p90 of cognitive complexity in real OSS
// projects of that framework, with the legacy COMPLEXITY_THRESHOLD as
// the fallback.
//
//   ≤ threshold/2  → 100  (simple function)
//   threshold      → 60   (at p90 — start of concern)
//   threshold*3    → 20   (floor — material outlier)
function scoreOneComplexityValue(value: number, threshold: number): number {
  const low = Math.max(5, threshold / 2);
  const mid = threshold;
  const high = threshold * 3;
  if (value <= low) return 100;
  if (value >= high) return 20;
  if (value <= mid) {
    const t = (value - low) / (mid - low);
    return 100 - t * 40;
  }
  const t = (value - mid) / (high - mid);
  return 60 - t * 40;
}

// Complexity — blends avg (meio da distribuição) with p95 (cauda) so that the
// score responds when either the typical function OR the worst-5% of functions
// gets worse. p95 carries more weight (60%) because the worst files are what
// actually cause pain during refactors. Hotspot count stays as an additional
// density penalty — v1.4 Sprint 2 #11 removes the hard -40 cap and uses an
// asymptotic curve so each new hotspot still hurts a little.
function scoreComplexity(
  avgComplexity: number,
  p95Complexity: number,
  hotspotsCount: number,
  framework: string
): number {
  const fwk = getThresholdsForFramework(framework);
  const threshold = fwk.complexity || COMPLEXITY_THRESHOLD;
  const avgScore = scoreOneComplexityValue(avgComplexity, threshold);
  const p95Score = scoreOneComplexityValue(p95Complexity, threshold);
  // 40% avg + 60% p95 — tail-weighted intentionally.
  const blended = avgScore * 0.4 + p95Score * 0.6;

  // v1.4 Sprint 2 #11 — Hotspot density: asymptotic to 40.
  //   0 hotspots → 0 penalty
  //   5 hotspots → ~17.5
  //   10 hotspots → ~28.7
  //   20 hotspots → ~36.7
  //   50 hotspots → ~39.9
  // Every additional hotspot moves the needle, but diminishing returns keep
  // the floor around 40 so complexity doesn't bottom out to 0 from density
  // alone.
  const hotspotPenalty = 40 * (1 - Math.exp(-hotspotsCount / 8));

  return Math.max(0, Math.round(blended - hotspotPenalty));
}

// v1.4 Sprint 4 #8 — Test coverage proxy.
//
// This is NOT real coverage — archradar doesn't run your tests. It counts
// files matching `*.test.*`, `*.spec.*`, `__tests__/` and produces a ratio
// of test files to source files. That ratio is a cultural indicator: a
// project with zero test files is making a very different statement about
// quality than a project with 0.5 ratio (1 test per 2 source files).
//
// The curve:
//   ratio 0     → 20 (zero test files is a strong signal)
//   ratio 0.1   → 40
//   ratio 0.3   → 80 (mature mainstream)
//   ratio 0.5+  → 100 (exceptional)
//
// Projects with fewer than 20 source files are too small to judge — we
// return null so the weight is redistributed to the other components.
//
// See DESIGN.md for the honest limitation: this is a proxy, not coverage.
function scoreTests(testCoverageRatio: number, sourceFileCount: number): number | null {
  if (sourceFileCount < 20) return null;
  if (testCoverageRatio <= 0) return 20;
  if (testCoverageRatio >= 0.5) return 100;
  if (testCoverageRatio < 0.1) {
    // 0 → 20, 0.1 → 40
    const t = testCoverageRatio / 0.1;
    return Math.round(20 + t * 20);
  }
  if (testCoverageRatio < 0.3) {
    // 0.1 → 40, 0.3 → 80
    const t = (testCoverageRatio - 0.1) / 0.2;
    return Math.round(40 + t * 40);
  }
  // 0.3 → 80, 0.5 → 100
  const t = (testCoverageRatio - 0.3) / 0.2;
  return Math.round(80 + t * 20);
}

// v1.4 Sprint 2 #1 + Sprint 5 #13 — Worst-file penalty.
//
// Averaging dilutes individual catastrophic files: a 214-file project with
// ONE admin/page.tsx at 1141 lines scores about the same as a healthy codebase
// because the avg is dragged down only slightly. This component scores the
// PROJECT as a function of its SINGLE worst outlier — so one 1141-line file
// can no longer hide inside an OK average.
//
// v1.4 Sprint 5 adds MAX FUNCTION lines as a third axis. A 200-line file
// with a 180-line function is different from a 200-line file with 10
// focused 20-line functions.
//
// Formula anchors:
//   worst file lines = 200     → 100 (completely fine)
//   worst file lines = 500     → 60
//   worst file lines = 1000    → 30
//   worst file lines >= 1500   → 20 (floor)
//
//   worst function lines = 50  → 100
//   worst function lines = 150 → 60
//   worst function lines = 300 → 30
//   worst function lines >= 500 → 20 (floor)
//
//   worst cognitive complexity = 5   → 100
//   worst cognitive complexity = 30  → 60
//   worst cognitive complexity = 100 → 20 (floor)
//
// We take the WORST of all three — any one catastrophe dominates the review.
function scoreWorstFile(
  criticalFiles: FileInfo[],
  hotspots: Array<{ file: string; function: string; complexity: number; lines: number }>
): number {
  // Empty project → no worst file, default 100.
  if (criticalFiles.length === 0 && hotspots.length === 0) return 100;

  // Largest file by line count.
  const worstFileLines = criticalFiles.reduce((max, f) => Math.max(max, f.lines), 0);
  // Largest function by complexity.
  const worstComplexity = hotspots.reduce((max, h) => Math.max(max, h.complexity), 0);
  // Largest function by line count.
  const worstFnLines = hotspots.reduce((max, h) => Math.max(max, h.lines), 0);

  // File-lines subscore: smooth linear decay.
  let fileLinesScore = 100;
  if (worstFileLines >= 1500) fileLinesScore = 20;
  else if (worstFileLines > 200) {
    const t = (worstFileLines - 200) / (1500 - 200);
    fileLinesScore = Math.round(100 - t * 80);
  }

  // Function-lines subscore.
  let fnLinesScore = 100;
  if (worstFnLines >= 500) fnLinesScore = 20;
  else if (worstFnLines > 50) {
    const t = (worstFnLines - 50) / (500 - 50);
    fnLinesScore = Math.round(100 - t * 80);
  }

  // Complexity subscore.
  let complexityScore = 100;
  if (worstComplexity >= 100) complexityScore = 20;
  else if (worstComplexity > 5) {
    const t = (worstComplexity - 5) / (100 - 5);
    complexityScore = Math.round(100 - t * 80);
  }

  // Return the WORST of the three — one catastrophe is enough.
  return Math.min(fileLinesScore, fnLinesScore, complexityScore);
}

// v1.4 Sprint 9 — Grade thresholds.
//
// Two paths:
//   1. Per-framework quantile thresholds from the calibration .fewserial,
//      where A = top 10% of OSS projects in that framework, B = top 50%,
//      C = top 75%, D = top 90%, F = bottom 10%. This makes grades
//      directly comparable to "where do I sit among real projects".
//   2. Hardcoded fallback when no calibration data exists for the framework
//      (or no GRA/GRB/GRC/GRD fields in the .fewserial yet).
function gradeFromScore(score: number, framework: string): Grade {
  const fwk = getThresholdsForFramework(framework);
  const g = fwk.gradeThresholds;
  if (g) {
    if (score >= g.A) return 'A';
    if (score >= g.B) return 'B';
    if (score >= g.C) return 'C';
    if (score >= g.D) return 'D';
    return 'F';
  }
  // Hardcoded fallback (v1.3 thresholds).
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// v1.4 Sprint 2 #10 — Continuous size ceiling.
//
// Previously: 4 discrete steps (65/75/85/100) with cliffs at 10/20/50 files.
// A project going from 49 → 50 files jumped from ceiling 85 to 100. Cliff.
//
// Now: smooth log10 curve. Ceiling grows with the log of the file count so
// small projects are capped but each file actually moves the ceiling.
//
//   1 file    → 60  (nothing to say about architecture yet)
//   10 files  → 80
//   100 files → 100
//   1000+     → 100 (cap)
//
// Formula: 60 + 40 * min(1, log10(max(1, files)) / 2)
function sizeCeiling(totalFiles: number): number {
  const log = Math.log10(Math.max(1, totalFiles));
  return Math.round(60 + 40 * Math.min(1, log / 2));
}

export function calculateHealthScore(
  scan: ScanResult,
  analysis: AnalysisResult
): { health: HealthScore; breakdown: ScoreBreakdown; explanation: ScoreExplanation } {
  const fileSizeScore   = scoreFileSize(scan.files.avgLinesPerFile);
  const criticalScore   = scoreCriticalFiles(scan.files.criticalFiles.length, scan.files.totalFiles);
  const structureScore  = scoreStructure(scan.structure.hasRecognizedPattern, scan.structure.folders.length);
  const depsScore       = scoreDependencies(scan.dependencies.suspiciousDeps.length, scan.dependencies.heavyDeps.length);
  const fwkName = scan.framework.framework;
  const couplingScore   = scoreCoupling(analysis.coupling.avgCoupling, fwkName);
  const complexityScore = scoreComplexity(
    analysis.complexity.avgComplexity,
    analysis.complexity.p95Complexity,
    analysis.complexity.hotspots.length,
    fwkName
  );
  const worstFileScore  = scoreWorstFile(scan.files.criticalFiles, analysis.complexity.hotspots);
  const modScore        = analysis.modularity.modularityScore; // may be null
  const testsScore      = scoreTests(scan.files.testCoverageRatio, scan.files.sourceFileCount);

  // v1.4 Sprint 2 #2 — Rebalanced weights.
  //
  // Old v1.3: every component at 15%, modularity at 10%. Problem: structure
  // and dependencies were practically free points for any modern framework
  // app — 30% of the score was guaranteed regardless of code quality.
  //
  // New v1.4: complexity and worstFile are promoted, structure/deps reduced
  // to reflect how much signal each actually carries. Sprint 4 adds a
  // "tests" component (placeholder here — redistributed when null) with
  // another 10%.
  //
  //   fileSize       10%
  //   criticalFiles  15%
  //   structure       5%
  //   dependencies   10%
  //   coupling       15%
  //   complexity     20%
  //   worstFile      10%
  //   modularity     10% (nullable — redistributed if project has no UI/hook files)
  //   tests          10% (nullable — redistributed if <20 source files) [Sprint 4]
  //
  // Total: 105%. When modularity or tests is null, its weight is redistributed
  // proportionally across the remaining components via the totalWeight divide.
  // v1.5 — Resolve the calibration anchors once so the explanation can cite
  // the exact threshold each component scored against. These are the same
  // values scoreCoupling/scoreComplexity/gradeFromScore resolve internally —
  // we read them here purely for transparency, not to re-score.
  const fwk = getThresholdsForFramework(fwkName);
  const couplingAnchor = fwk.highCoupling || HIGH_COUPLING_THRESHOLD;
  const complexityAnchor = fwk.complexity || COMPLEXITY_THRESHOLD;
  const anchorSuffix =
    fwk.source === 'community'
      ? `p90 ${fwkName} (N=${fwk.sampleSize ?? '?'})`
      : 'fallback (no community data)';

  // Each row carries its display metadata + the anchor it scored against.
  // `weight` here is the nominal weight; `contribution` is computed after
  // renormalization below so the rows always sum to the weighted average.
  const rows: Array<{
    key: keyof ScoreBreakdown;
    label: string;
    value: number;
    weight: number;
    anchor: string | null;
  }> = [
    { key: 'fileSize',      label: 'File size',      value: fileSizeScore,   weight: 0.10, anchor: null },
    { key: 'criticalFiles', label: 'Critical files', value: criticalScore,   weight: 0.15, anchor: null },
    { key: 'structure',     label: 'Structure',      value: structureScore,  weight: 0.05, anchor: null },
    { key: 'dependencies',  label: 'Dependencies',   value: depsScore,       weight: 0.10, anchor: null },
    { key: 'coupling',      label: 'Coupling',       value: couplingScore,   weight: 0.15, anchor: `coupling ${couplingAnchor} imports/file — ${anchorSuffix}` },
    { key: 'complexity',    label: 'Complexity',     value: complexityScore, weight: 0.20, anchor: `cognitive complexity ${complexityAnchor} — ${anchorSuffix}` },
    { key: 'worstFile',     label: 'Worst file',     value: worstFileScore,  weight: 0.10, anchor: null },
  ];
  if (modScore !== null) {
    rows.push({ key: 'modularity', label: 'Modularity', value: modScore, weight: 0.10, anchor: null });
  }
  if (testsScore !== null) {
    rows.push({ key: 'tests', label: 'Tests (proxy)', value: testsScore, weight: 0.10, anchor: null });
  }

  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);
  const weightedSum = rows.reduce((sum, r) => sum + r.value * r.weight, 0) / totalWeight;
  const rawScore = Math.round(weightedSum);

  // v1.4 Sprint 6 #12 — Tech debt penalty (up to -10pts).
  const debtPenalty = techDebtPenalty(analysis.techDebt);
  // v1.4 Sprint 11 #3 — Data flow penalty (up to -20pts).
  const flowPenalty = dataFlowPenalty(analysis.dataFlow);
  const afterPenalty = Math.max(0, rawScore - debtPenalty - flowPenalty);

  // Apply size ceiling: tiny projects can't earn the top grades.
  const ceiling = sizeCeiling(scan.files.totalFiles);
  const score = Math.min(afterPenalty, ceiling);
  const grade = gradeFromScore(score, fwkName);

  // v1.5 — Build the audit trail from the SAME numbers used above. The
  // `contribution` of each row is its renormalized share so the rows sum to
  // `weightedSum`. tests/explain.test.ts asserts the identity holds.
  const components: ScoreComponentExplanation[] = rows.map((r) => ({
    key: r.key,
    label: r.label,
    value: r.value,
    weight: r.weight,
    contribution: Math.round(((r.value * r.weight) / totalWeight) * 10) / 10,
    anchor: r.anchor,
  }));

  const penalties: ScorePenaltyExplanation[] = [];
  if (debtPenalty > 0) {
    penalties.push({
      label: 'Tech debt',
      points: debtPenalty,
      reason: `${analysis.techDebt.densityPerKLoc.toFixed(1)} markers/KLOC`,
    });
  }
  if (flowPenalty > 0) {
    penalties.push({
      label: 'Data flow',
      points: flowPenalty,
      reason: `${analysis.dataFlow.sharedMutables.length} shared mutable(s), ${analysis.dataFlow.mutableSingletons.length} mutable singleton(s)`,
    });
  }

  const explanation: ScoreExplanation = {
    components,
    totalWeight,
    weightedSum: Math.round(weightedSum * 10) / 10,
    penalties,
    afterPenalty,
    ceiling: {
      value: ceiling,
      totalFiles: scan.files.totalFiles,
      applied: afterPenalty > ceiling,
    },
    finalScore: score,
    grade,
    calibration: {
      framework: fwkName,
      source: fwk.source,
      sampleSize: fwk.sampleSize,
      lowConfidence: fwk.source === 'fallback' || (fwk.sampleSize ?? 0) < 15,
    },
  };

  return {
    health: { score, grade },
    breakdown: {
      fileSize: fileSizeScore,
      criticalFiles: criticalScore,
      structure: structureScore,
      dependencies: depsScore,
      coupling: couplingScore,
      complexity: complexityScore,
      worstFile: worstFileScore,
      modularity: modScore,
      tests: testsScore,
    },
    explanation,
  };
}
