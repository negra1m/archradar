// v1.4 Sprint 8 — Per-framework threshold loader for the CLI.
//
// Reads the embedded `src/data/calibration.fewserial` (synced from
// archradar-api by scripts/sync-calibration.js) and exposes per-framework
// thresholds derived from real OSS percentiles:
//
//   highCoupling   = p90 of avg coupling for that framework
//   complexity     = p90 of avg cognitive complexity for that framework
//
// Why p90? Anything above the 90th percentile of real projects is, by
// definition, an outlier. The threshold is "where the tail starts" for
// that specific framework. A Next.js page importing 8 things is normal;
// a React hook with 8 imports is suspicious.
//
// Fallbacks (in order):
//   1. .fewserial entry for the framework with sampleSize >= 5
//   2. .fewserial entry for "default" framework
//   3. Hardcoded constants (HIGH_COUPLING_THRESHOLD = 12, COMPLEXITY = 10)
//
// Loader runs once at module load — no disk reads after first call.

import fs from 'fs';
import path from 'path';

export interface FrameworkThresholds {
  highCoupling: number;
  complexity: number;
  source: 'community' | 'fallback';
  /**
   * v1.5 — calibration sample size (N) for this framework. Null for the
   * hardcoded fallback (no community data). Exposed so `--explain` and
   * `archradar calibration` can be honest about confidence.
   */
  sampleSize: number | null;
  /**
   * v1.4 Sprint 9 — quantile-derived grade thresholds. When present, the
   * scorer uses these instead of the hardcoded A>=85, B>=70, etc.
   * Null when the calibration sample didn't include grade data (fall back
   * to hardcoded grade boundaries).
   */
  gradeThresholds?: { A: number; B: number; C: number; D: number };
}

const HARDCODED_FALLBACK: FrameworkThresholds = {
  highCoupling: 12,
  complexity: 10,
  source: 'fallback',
  sampleSize: null,
};

// CJS-compatible path resolution. The compiled file lives at
// dist/src/utils/calibrationLoader.js, so we look at dist/src/data first
// (post-build copy) then fall back to source path during dev.
function resolveCalibrationPath(): string | null {
  const candidates = [
    path.resolve(__dirname, '../data/calibration.fewserial'),
    path.resolve(__dirname, '../../src/data/calibration.fewserial'),
    path.resolve(__dirname, '../../../src/data/calibration.fewserial'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function unescapeValue(v: string): string {
  let out = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && i + 1 < v.length) {
      const next = v[i + 1];
      if (next === '\\') out += '\\';
      else if (next === '|') out += '|';
      else if (next === ':') out += ':';
      else if (next === 'n') out += '\n';
      else out += next;
      i++;
      continue;
    }
    out += v[i];
  }
  return out;
}

function splitUnescaped(line: string, sep: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && i + 1 < line.length) {
      current += line[i] + line[i + 1];
      i++;
      continue;
    }
    if (line[i] === sep) {
      parts.push(current);
      current = '';
      continue;
    }
    current += line[i];
  }
  parts.push(current);
  return parts;
}

function parseKv(line: string): Record<string, string> {
  return Object.fromEntries(
    splitUnescaped(line, '|').map((pair) => {
      let sepIdx = -1;
      for (let i = 0; i < pair.length; i++) {
        if (pair[i] === '\\' && i + 1 < pair.length) {
          i++;
          continue;
        }
        if (pair[i] === ':') {
          sepIdx = i;
          break;
        }
      }
      if (sepIdx === -1) return [pair, ''];
      return [pair.slice(0, sepIdx), unescapeValue(pair.slice(sepIdx + 1))];
    })
  );
}

let cache: Map<string, FrameworkThresholds> | null | undefined;

function loadCalibration(): Map<string, FrameworkThresholds> | null {
  const filePath = resolveCalibrationPath();
  if (!filePath) return null;

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n').filter((l) => l.trim());
  const out = new Map<string, FrameworkThresholds>();

  for (const line of lines) {
    if (!line.startsWith('→fw|')) continue;
    const f = parseKv(line.slice(4));
    const framework = f['NAM'];
    if (!framework) continue;

    const sampleSize = Number(f['CNT'] ?? 0);
    if (sampleSize < 5) continue; // not enough data to trust

    // Per-framework thresholds derived from real OSS p90s.
    // Read with fallback to hardcoded values if a band is missing.
    // v1.4 Sprint 9: prefer P90P (cognitive p95 percentile) over P90X
    // (avg complexity percentile) when available, since the scoring
    // curve is anchored at the function-level threshold.
    const highCoupling = Number(f['P90C'] ?? HARDCODED_FALLBACK.highCoupling);
    const complexityFromP95 = Number(f['P90P'] ?? 0);
    const complexity = complexityFromP95 > 0
      ? complexityFromP95
      : Number(f['P90X'] ?? HARDCODED_FALLBACK.complexity);

    // v1.4 Sprint 9 — read grade thresholds if present.
    const gA = Number(f['GRA'] ?? 0);
    const gB = Number(f['GRB'] ?? 0);
    const gC = Number(f['GRC'] ?? 0);
    const gD = Number(f['GRD'] ?? 0);
    const hasGrades = gA > 0 && gB > 0 && gC > 0 && gD > 0;

    out.set(framework, {
      highCoupling: highCoupling > 0 ? highCoupling : HARDCODED_FALLBACK.highCoupling,
      complexity: complexity > 0 ? complexity : HARDCODED_FALLBACK.complexity,
      source: 'community',
      sampleSize,
      gradeThresholds: hasGrades ? { A: gA, B: gB, C: gC, D: gD } : undefined,
    });
  }

  return out.size > 0 ? out : null;
}

function getCache(): Map<string, FrameworkThresholds> | null {
  if (cache === undefined) {
    cache = loadCalibration();
  }
  return cache;
}

/**
 * Resolve the threshold pair for a given framework. Falls back to the
 * hardcoded constants if no community data exists for that framework.
 */
export function getThresholdsForFramework(framework: string): FrameworkThresholds {
  const c = getCache();
  if (!c) return HARDCODED_FALLBACK;
  return c.get(framework) ?? HARDCODED_FALLBACK;
}

/** For tests: clear the cache so the next call re-reads disk. */
export function resetCalibrationCache(): void {
  cache = undefined;
}
