import {
  ScanResult,
  AnalysisResult,
  HealthScore,
  Grade,
  ScoreBreakdown,
} from '../../types/index.js';
import { HIGH_COUPLING_THRESHOLD } from '../analyzer/couplingAnalyzer.js';
import { COMPLEXITY_THRESHOLD } from '../analyzer/complexityAnalyzer.js';

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

// Coupling — anchored to HIGH_COUPLING_THRESHOLD. Smooth curve:
//   ≤ THRESHOLD/3  → 100 (well below the tail)
//   = THRESHOLD    → ~55 (borderline)
//   ≥ THRESHOLD*2  → 20  (definitive outlier)
function scoreCoupling(avgCoupling: number): number {
  const low = HIGH_COUPLING_THRESHOLD / 3; // 4 imports → 100
  const high = HIGH_COUPLING_THRESHOLD * 2; // 24 imports → 20
  if (avgCoupling <= low) return 100;
  if (avgCoupling >= high) return 20;
  const t = (avgCoupling - low) / (high - low);
  return Math.round(100 - t * 80);
}

// Complexity — blends avg and hotspot density into one score, both anchored
// to COMPLEXITY_THRESHOLD. A file at threshold=10 sits at the boundary and
// a file well above it drives the score toward the floor.
function scoreComplexity(avgComplexity: number, hotspotsCount: number): number {
  // Avg component: ≤ THRESHOLD/3 → 100, ≥ THRESHOLD → 40, linear between.
  const low = COMPLEXITY_THRESHOLD / 3; // ~3.3 → 100
  const high = COMPLEXITY_THRESHOLD;     // 10 → 40
  let avgScore: number;
  if (avgComplexity <= low) avgScore = 100;
  else if (avgComplexity >= high) avgScore = 40;
  else {
    const t = (avgComplexity - low) / (high - low);
    avgScore = 100 - t * 60;
  }

  // Hotspot density penalty: 0 hotspots = no penalty, each hotspot -5
  // up to a cap of -40. Keeps the floor at 0.
  const hotspotPenalty = Math.min(40, hotspotsCount * 5);

  return Math.max(0, Math.round(avgScore - hotspotPenalty));
}

function gradeFromScore(score: number): Grade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// Small-project bias mitigation.
//
// A 10-file project cannot demonstrate real architectural discipline — it
// simply has too little surface area to expose problems. Cap the final score
// so "twitter-bio-in-12-files" can't score the same as a 5000-file SaaS.
// These caps kick in AFTER the weighted sum, as an upper bound only.
//
// totalFiles < 10  → cap 65 (D/C max)
// totalFiles < 20  → cap 75 (B-)
// totalFiles < 50  → cap 85 (A-)
// totalFiles >= 50 → no cap
function sizeCeiling(totalFiles: number): number {
  if (totalFiles < 10) return 65;
  if (totalFiles < 20) return 75;
  if (totalFiles < 50) return 85;
  return 100;
}

export function calculateHealthScore(
  scan: ScanResult,
  analysis: AnalysisResult
): { health: HealthScore; breakdown: ScoreBreakdown } {
  const fileSizeScore   = scoreFileSize(scan.files.avgLinesPerFile);
  const criticalScore   = scoreCriticalFiles(scan.files.criticalFiles.length, scan.files.totalFiles);
  const structureScore  = scoreStructure(scan.structure.hasRecognizedPattern, scan.structure.folders.length);
  const depsScore       = scoreDependencies(scan.dependencies.suspiciousDeps.length, scan.dependencies.heavyDeps.length);
  const couplingScore   = scoreCoupling(analysis.coupling.avgCoupling);
  const complexityScore = scoreComplexity(analysis.complexity.avgComplexity, analysis.complexity.hotspots.length);
  const modScore        = analysis.modularity.modularityScore; // may be null

  // Weighted sum. When modularity is not applicable (backend-only project),
  // its 10% weight is redistributed proportionally across the other six
  // components so the total still sums to 100.
  const components: Array<{ value: number; weight: number }> = [
    { value: fileSizeScore,   weight: 0.15 },
    { value: criticalScore,   weight: 0.15 },
    { value: structureScore,  weight: 0.15 },
    { value: depsScore,       weight: 0.15 },
    { value: couplingScore,   weight: 0.15 },
    { value: complexityScore, weight: 0.15 },
  ];
  if (modScore !== null) {
    components.push({ value: modScore, weight: 0.10 });
  }
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weightedSum = components.reduce((sum, c) => sum + c.value * c.weight, 0);
  const rawScore = Math.round(weightedSum / totalWeight);

  // Apply size ceiling: tiny projects can't earn the top grades.
  const ceiling = sizeCeiling(scan.files.totalFiles);
  const score = Math.min(rawScore, ceiling);

  return {
    health: { score, grade: gradeFromScore(score) },
    breakdown: {
      fileSize: fileSizeScore,
      criticalFiles: criticalScore,
      structure: structureScore,
      dependencies: depsScore,
      coupling: couplingScore,
      complexity: complexityScore,
      modularity: modScore,
    },
  };
}
