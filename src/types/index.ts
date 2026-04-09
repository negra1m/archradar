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

export interface DependencyScanResult {
  totalDeps: number;
  suspiciousDeps: string[];
  heavyDeps: string[];
}

export interface StructureScanResult {
  folders: string[];
  hasRecognizedPattern: boolean;
  patternName: string;
}

export interface AnalysisResult {
  complexity: ComplexityResult;
  coupling: CouplingResult;
  circularDeps: CircularDepsResult;
  modularity: ModularityResult;
}

export interface ComplexityResult {
  avgComplexity: number;
  hotspots: Array<{ file: string; function: string; complexity: number }>;
}

export interface CouplingResult {
  avgCoupling: number;
  highCouplingFiles: Array<{ file: string; imports: number }>;
}

export interface CircularDepsResult {
  hasCycles: boolean;
  cycles: string[][];
}

export interface ModularityResult {
  modularityScore: number;
  issues: string[];
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface HealthScore {
  score: number;
  grade: Grade;
}

export interface RiskInfo {
  riskLevel: RiskLevel;
  riskDescription: string;
}

export interface ScoreResult {
  health: HealthScore;
  risk: RiskInfo;
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
  modularity: number;
}
