// FEW-AI-SERIAL — Archradar domain encoder/decoder (CLI side)
// Patent: BR 10 2026 008196 5 | Few Company

export interface ScanPayload {
  framework: string;
  version: string;
  totalFiles: number;
  avgLines: number;
  healthScore: number;
  grade: string;
  riskLevel: string;
  avgCoupling: number;
  avgComplexity: number;
  circularDeps: number;
  criticalFiles: number;
  hotspots?: Array<{ file: string; fn: string; score: number }>;
}

export interface ScanResponse {
  scanId: string;
  prevScore: number;
  currentScore: number;
  delta: number;
  trend: 'up' | 'down' | 'stable';
  insights: string[];
}

const SCAN_HEADER = '@few v1.0 domain:archradar';

function kv(fields: Record<string, string | number | undefined>): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}

function parseKv(line: string): Record<string, string> {
  return Object.fromEntries(
    line.split('|').map((pair) => {
      const idx = pair.indexOf(':');
      return [pair.slice(0, idx), pair.slice(idx + 1)];
    })
  );
}

export function encodeScan(data: ScanPayload): string {
  const main = kv({
    FWK: data.framework,
    VRS: data.version,
    TFL: data.totalFiles,
    AVG: data.avgLines,
    SCR: data.healthScore,
    GRD: data.grade,
    RSK: data.riskLevel,
    CPL: data.avgCoupling,
    CMX: data.avgComplexity,
    CRC: data.circularDeps,
    CRT: data.criticalFiles,
    TST: Date.now(),
  });

  const hotspots = (data.hotspots ?? [])
    .map((h) => `→${kv({ FIL: h.file, FNC: h.fn, SCX: h.score })}`)
    .join('\n');

  return [SCAN_HEADER, main, hotspots].filter(Boolean).join('\n');
}

export function decodeResponse(raw: string): ScanResponse {
  const line = raw.split('\n').find((l) => !l.startsWith('@few') && l.trim()) ?? '';
  const f = parseKv(line);
  const delta = Number((f['DLT'] ?? '0').replace('+', ''));
  return {
    scanId: f['SCN'] ?? '',
    prevScore: Number(f['PVS'] ?? 0),
    currentScore: Number(f['CUR'] ?? 0),
    delta,
    trend: (f['TRD'] ?? 'stable') as ScanResponse['trend'],
    insights: (f['INS'] ?? '').split(';;').filter(Boolean),
  };
}
