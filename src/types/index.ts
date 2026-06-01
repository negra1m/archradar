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
  /**
   * Number of SOURCE files (excludes test files).
   * Tests live in `testFileCount`.
   */
  totalFiles: number;
  avgLinesPerFile: number;
  criticalFiles: FileInfo[];
  /**
   * v1.4 Sprint 4 — source-file count (alias of totalFiles for clarity).
   */
  sourceFileCount: number;
  /**
   * Number of files matching test patterns (`*.test.*`, `*.spec.*`,
   * `__tests__/`, top-level `tests/`).
   */
  testFileCount: number;
  /**
   * Ratio testFileCount / sourceFileCount. NOT real coverage — this is a
   * proxy for test culture. Real coverage requires running jest/vitest and
   * parsing LCOV. See DESIGN.md for the honest limitation.
   */
  testCoverageRatio: number;
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

// Re-export tech-debt types from the analyzer module so callers can import
// everything from `types/index.ts`.
import type {
  TechDebtMarker,
  TechDebtMarkerType,
  TechDebtResult,
} from '../core/analyzer/techDebtAnalyzer.js';
export type { TechDebtMarker, TechDebtMarkerType, TechDebtResult };

// Re-export data-flow types.
import type {
  SharedMutable,
  ImportTimeSideEffect,
  MutableSingleton,
  DataFlowResult,
} from '../core/analyzer/dataFlowAnalyzer.js';
export type { SharedMutable, ImportTimeSideEffect, MutableSingleton, DataFlowResult };

export interface AnalysisResult {
  complexity: ComplexityResult;
  coupling: CouplingResult;
  circularDeps: CircularDepsResult;
  modularity: ModularityResult;
  /** v1.4 Sprint 6 — tech debt markers (TODO, @ts-ignore, eslint-disable...). */
  techDebt: TechDebtResult;
  /** v1.4 Sprint 11 — basic data flow detection (shared mutables, side effects, singletons). */
  dataFlow: DataFlowResult;
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
   * 95th percentile of cognitive complexity across all functions (v1.4+).
   * Gives a truer picture of the codebase's complexity load than `avg`,
   * which is dragged down by trivial functions.
   */
  p95Complexity: number;
  /**
   * v1.4 Sprint 5 — Largest function by line count found across the
   * whole project. Computed independently of complexity so a long-but-
   * simple function still gets flagged.
   */
  maxFunctionLines: number;
  hotspots: Array<{
    file: string;
    function: string;
    complexity: number;
    /**
     * v1.4 Sprint 5 — line count of this specific function
     * (endLine - startLine + 1).
     */
    lines: number;
  }>;
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
  /**
   * How many `import type { ... }` declarations were excluded from the cycle graph.
   * Type-only imports are stripped at compile time, so a cycle between them is
   * not a runtime cycle. We count them for transparency — a high number means
   * earlier archradar versions would have reported a lot of false positives.
   */
  typeOnlyImportsFiltered: number;
}

export type ModularityViolationType =
  | 'ui-imports-logic'
  | 'hook-imports-ui'
  // v1.4 Sprint 7 additions:
  | 'god-store'
  | 'context-overconsumed'
  | 'prop-drilling';

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
  /**
   * v1.5 — full audit trail of how the score was computed. Source of truth
   * for `--explain` and the enriched `--json` output. Lets a user (or CI)
   * verify the headline score by re-doing the arithmetic. The identity
   *   min(weightedSum - penalties, ceiling) === health.score
   * must always hold (see tests/explain.test.ts).
   */
  explanation: ScoreExplanation;
}

/**
 * v1.5 — One row of the weighted-average calculation. `contribution` is the
 * exact point value this component added to the weighted sum:
 *   contribution = value * (weight / totalWeight)
 * `anchor` is the calibration source for the threshold this component scored
 * against (e.g. "p90 React coupling = 4"), or null for components with no
 * per-framework anchor (fileSize, structure, dependencies, tests).
 */
export interface ScoreComponentExplanation {
  key: keyof ScoreBreakdown;
  label: string;
  value: number;
  weight: number;
  /** value * (weight / totalWeight) — actual points added to the weighted sum. */
  contribution: number;
  anchor: string | null;
}

/** v1.5 — A flat penalty applied after the weighted average (tech debt, data flow). */
export interface ScorePenaltyExplanation {
  label: string;
  points: number;
  reason: string;
}

export interface ScoreExplanation {
  components: ScoreComponentExplanation[];
  /** Sum of (weight/totalWeight) across active components — always 1.0 after renormalization. */
  totalWeight: number;
  /** Weighted average before penalties and ceiling. */
  weightedSum: number;
  penalties: ScorePenaltyExplanation[];
  /** Score after subtracting penalties from weightedSum, floored at 0. */
  afterPenalty: number;
  ceiling: {
    value: number;
    totalFiles: number;
    /** True when the ceiling actually lowered the score. */
    applied: boolean;
  };
  /** Final score === breakdown-derived calculation. Mirrors health.score. */
  finalScore: number;
  grade: Grade;
  /** Calibration provenance for the framework this project was scored against. */
  calibration: {
    framework: string;
    source: 'community' | 'fallback';
    /** Sample size (N) when known from the community calibration, else null. */
    sampleSize: number | null;
    /** True when N is too small (or fallback) to fully trust the anchors. */
    lowConfidence: boolean;
  };
}

export interface ScoreBreakdown {
  fileSize: number;
  criticalFiles: number;
  structure: number;
  dependencies: number;
  coupling: number;
  complexity: number;
  /**
   * v1.4 Sprint 2 #1 — dedicated score for the single worst file in the
   * project. Mitigates the averaging dilution problem where one 1000-line
   * file hides inside an OK avg.
   */
  worstFile: number;
  /** null when modularity is not assessable (backend-only project). */
  modularity: number | null;
  /**
   * v1.4 Sprint 4 #8 — test culture proxy (test file count / source file
   * count). Null when the project is too small to judge (<20 source files).
   * See DESIGN.md for the honest limitation: this is NOT real coverage.
   */
  tests: number | null;
}
