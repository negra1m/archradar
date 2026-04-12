// v1.4 Sprint 6 #12 — Tech debt marker analyzer.
//
// Walks source files (not test files) and counts explicit markers that
// indicate known debt:
//
//   // TODO / // FIXME / // HACK / // XXX / // BUG
//   // @deprecated  (JSDoc deprecation)
//   @ts-ignore / @ts-expect-error / @ts-nocheck
//   eslint-disable / eslint-disable-next-line
//
// Output:
//   - total counts per type
//   - density per 1000 lines of source (KLOC)
//   - top files by marker count (high-density hotspots)
//
// Integration: the count is applied as a FLAT penalty on the final score
// (up to -10 pts), NOT as a new weighted component. Rationale: tech debt
// is a signal, not a dimension — you don't want a project with zero TODOs
// to score 10pts higher than an otherwise-identical one, so we use a
// penalty with a cap instead.

import fg from 'fast-glob';
import fs from 'fs/promises';
import path from 'path';

export interface TechDebtMarker {
  file: string;
  line: number;
  type: TechDebtMarkerType;
}

export type TechDebtMarkerType =
  | 'todo'
  | 'fixme'
  | 'hack'
  | 'xxx'
  | 'bug'
  | 'deprecated'
  | 'ts-ignore'
  | 'ts-expect-error'
  | 'ts-nocheck'
  | 'eslint-disable';

export interface TechDebtResult {
  /** Total marker count across all source files. */
  totalMarkers: number;
  /** Count grouped by type. */
  byType: Record<TechDebtMarkerType, number>;
  /** Markers per 1000 lines of source (KLOC). */
  densityPerKLoc: number;
  /** Files with the highest marker count (top 10). */
  highDensityFiles: Array<{ file: string; count: number }>;
  /** Total source lines scanned (used for density). */
  sourceLoc: number;
}

/**
 * Regex patterns for each marker type.
 * Case-insensitive; matches comment markers but also bare `@ts-ignore`
 * inside comments.
 */
const PATTERNS: Array<{ type: TechDebtMarkerType; re: RegExp }> = [
  { type: 'todo', re: /\/\/\s*todo\b|\/\*\s*todo\b/i },
  { type: 'fixme', re: /\/\/\s*fixme\b|\/\*\s*fixme\b/i },
  { type: 'hack', re: /\/\/\s*hack\b|\/\*\s*hack\b/i },
  { type: 'xxx', re: /\/\/\s*xxx\b|\/\*\s*xxx\b/i },
  { type: 'bug', re: /\/\/\s*bug\b|\/\*\s*bug\b/i },
  { type: 'deprecated', re: /@deprecated\b/i },
  { type: 'ts-ignore', re: /@ts-ignore\b/ },
  { type: 'ts-expect-error', re: /@ts-expect-error\b/ },
  { type: 'ts-nocheck', re: /@ts-nocheck\b/ },
  { type: 'eslint-disable', re: /eslint-disable(?:-next-line)?\b/ },
];

function emptyByType(): Record<TechDebtMarkerType, number> {
  return {
    todo: 0,
    fixme: 0,
    hack: 0,
    xxx: 0,
    bug: 0,
    deprecated: 0,
    'ts-ignore': 0,
    'ts-expect-error': 0,
    'ts-nocheck': 0,
    'eslint-disable': 0,
  };
}

function isTestFile(rel: string): boolean {
  const normalized = rel.replace(/\\/g, '/').toLowerCase();
  if (/\.test\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized)) return true;
  if (/\.spec\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized)) return true;
  if (/\/__tests__\//.test(normalized)) return true;
  if (/^tests?\//.test(normalized)) return true;
  return false;
}

export async function analyzeTechDebt(projectPath: string): Promise<TechDebtResult> {
  const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue', '**/*.svelte'];
  const ignore = [
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/build/**',
    '**/.nuxt/**',
  ];

  const files = await fg(patterns, {
    cwd: projectPath,
    ignore,
    absolute: true,
  });

  const byType = emptyByType();
  const fileCounts = new Map<string, number>();
  let sourceLoc = 0;

  for (const filePath of files) {
    const rel = path.relative(projectPath, filePath);
    if (isTestFile(rel)) continue;

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    sourceLoc += lines.length;
    let fileCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { type, re } of PATTERNS) {
        if (re.test(line)) {
          byType[type]++;
          fileCount++;
        }
      }
    }

    if (fileCount > 0) fileCounts.set(rel, fileCount);
  }

  const totalMarkers = Object.values(byType).reduce((sum, n) => sum + n, 0);
  const densityPerKLoc = sourceLoc > 0 ? (totalMarkers * 1000) / sourceLoc : 0;

  const highDensityFiles = [...fileCounts.entries()]
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalMarkers,
    byType,
    densityPerKLoc,
    highDensityFiles,
    sourceLoc,
  };
}

/**
 * Convert a tech debt result into a score penalty (0 to -10).
 *
 * Anchors:
 *   density 0       → 0 penalty
 *   density 1/KLOC  → -2
 *   density 3/KLOC  → -6
 *   density 5+/KLOC → -10 (cap)
 */
export function techDebtPenalty(result: TechDebtResult): number {
  if (result.densityPerKLoc <= 0) return 0;
  if (result.densityPerKLoc >= 5) return 10;
  return Math.round(result.densityPerKLoc * 2);
}
