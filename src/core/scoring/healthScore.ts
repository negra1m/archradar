import { ScanResult, AnalysisResult, HealthScore, Grade, ScoreBreakdown } from '../../types/index.js';

function scoreFileSize(avgLines: number): number {
  if (avgLines <= 100) return 100;
  if (avgLines <= 200) return 80;
  if (avgLines <= 300) return 60;
  if (avgLines <= 400) return 40;
  return 20;
}

function scoreCriticalFiles(criticalCount: number, totalFiles: number): number {
  if (totalFiles === 0) return 100;
  const ratio = criticalCount / totalFiles;
  if (ratio === 0) return 100;
  if (ratio <= 0.05) return 80;
  if (ratio <= 0.15) return 60;
  if (ratio <= 0.30) return 40;
  return 20;
}

function scoreStructure(hasRecognizedPattern: boolean, folderCount: number): number {
  if (hasRecognizedPattern) return folderCount >= 3 ? 100 : 80;
  return folderCount >= 2 ? 40 : 20;
}

function scoreDependencies(suspicious: number, heavy: number): number {
  let score = 100;
  score -= suspicious * 15;
  score -= heavy * 5;
  return Math.max(0, score);
}

function scoreCoupling(avgCoupling: number): number {
  if (avgCoupling <= 5) return 100;
  if (avgCoupling <= 10) return 80;
  if (avgCoupling <= 15) return 60;
  if (avgCoupling <= 20) return 40;
  return 20;
}

function scoreComplexity(avgComplexity: number, hotspotsCount: number): number {
  let score = 100;
  if (avgComplexity > 10) score -= 40;
  else if (avgComplexity > 7) score -= 20;
  else if (avgComplexity > 4) score -= 10;
  score -= Math.min(40, hotspotsCount * 5);
  return Math.max(0, score);
}

function gradeFromScore(score: number): Grade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
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
  const modScore        = analysis.modularity.modularityScore;

  const score = Math.round(
    fileSizeScore   * 0.15 +
    criticalScore   * 0.15 +
    structureScore  * 0.15 +
    depsScore       * 0.15 +
    couplingScore   * 0.15 +
    complexityScore * 0.15 +
    modScore        * 0.10
  );

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
