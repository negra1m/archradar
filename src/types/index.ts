export interface FileInfo {
  path: string;
  lines: number;
  sizeBytes: number;
}

export interface ScanResult {
  projectPath: string;
  framework: FrameworkInfo;
  files: FileScanResult;
  dependencies: DependencyScanResult;
  structure: StructureScanResult;
}

export interface FrameworkInfo {
  framework: string;
  version: string;
  bundler: string;
}

export interface FileScanResult {
  totalFiles: number;
  avgLinesPerFile: number;
  criticalFiles: FileInfo[];
}

export interface DependencyInfo {
  name: string;
  version: string;
  category: 'runtime' | 'dev';
}

export interface DependencyScanResult {
  totalDeps: number;
  suspiciousDeps: string[];
  heavyDeps: string[];
  all: DependencyInfo[];
}

export interface StructureScanResult {
  folders: string[];
  hasRecognizedPattern: boolean;
  patternName: string;
  /** 0..100 — how closely the project matches the identified pattern. 100 = full match. */
  matchConfidence: number;
}

export interface AnalysisResult {
  complexity: ComplexityResult;
  coupling: CouplingResult;
  circularDeps: CircularDepsResult;
  modularity: ModularityResult;
}

// ===== Audit-level detectors (only run on `archradar audit`) =====

export interface BarrelFile {
  file: string;
  reExportCount: number;
}

export interface BarrelDetectionResult {
  hasBarrels: boolean;
  barrels: BarrelFile[];
  threshold: number;
}

export interface GodComponentFile {
  file: string;
  lines: number;
  imports: number;
  hookUsage: number;
  jsxReturns: number;
  reasons: string[];
}

export interface GodComponentDetectionResult {
  hasGodComponents: boolean;
  suspects: GodComponentFile[];
  thresholds: {
    lines: number;
    hooks: number;
    imports: number;
    jsxReturns: number;
  };
}

export interface AuditDetectionResult {
  barrels: BarrelDetectionResult;
  godComponents: GodComponentDetectionResult;
}

export interface ComplexityResult {
  avgComplexity: number;
  /**
   * 95th percentile of cyclomatic complexity across all functions.
   * Gives a truer picture of the codebase's complexity load than `avg`,
   * which is dragged down by trivial functions.
   */
  p95Complexity: number;
  hotspots: Array<{ file: string; function: string; complexity: number }>;
}

export interface CouplingResult {
  avgCoupling: number;
  highCouplingFiles: Array<{ file: string; imports: number }>;
  /** Full list of files with their import counts (all files, not just high-coupling). */
  perFileImports: Array<{ file: string; imports: number }>;
}

export interface CircularDepsResult {
  hasCycles: boolean;
  cycles: string[][];
  /** Full set of cycles before slicing. Used by API for ranking. */
  allCycles: string[][];
  /** Import graph: file -> list of locally-imported files. Kept for premium analysis. */
  graph: Record<string, string[]>;
}

export type ModularityViolationType = 'ui-imports-logic' | 'hook-imports-ui';

export interface ModularityViolation {
  file: string;
  type: ModularityViolationType;
  count: number;
}

export interface ModularityResult {
  /** null when the project has no UI/hook files to assess. */
  modularityScore: number | null;
  /** False for backend-only projects. Used by healthScore to redistribute weight. */
  applicable: boolean;
  issues: string[];
  violations: ModularityViolation[];
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface HealthScore {
  score: number;
  grade: Grade;
}

export interface ScoreResult {
  health: HealthScore;
  recommendations: string[];
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  fileSize: number;
  criticalFiles: number;
  structure: number;
  dependencies: number;
  coupling: number;
  complexity: number;
  /** null when modularity is not assessable (backend-only project). */
  modularity: number | null;
}
