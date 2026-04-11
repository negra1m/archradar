// FEW-AI-SERIAL — Archradar domain encoder/decoder (CLI side)
// Patent: BR 10 2026 008196 5 | Few Company
//
// v1.1 schema: main KV line + multiple typed sections.
// Section line format:  →<type>|KEY:value|KEY:value...
// Types: hot (hotspot) | cpl (coupling file) | edg (graph edge)
//        cyc (cycle chain) | crt (critical file) | vio (modularity violation)
//        dep (dependency)

export interface ScanPayload {
  framework: string;
  version: string;
  totalFiles: number;
  avgLines: number;
  healthScore: number;
  grade: string;
  /** @deprecated Risk level was removed in v1.3. Field kept for protocol compat but server ignores it. */
  riskLevel?: string;
  avgCoupling: number;
  avgComplexity: number;
  circularDeps: number;
  criticalFiles: number;
  modularityScore: number;
  scanId?: string;
  timestamp?: number;
  mode?: 'scan' | 'audit';
  hotspots?: Array<{ file: string; fn: string; score: number }>;
  coupling?: Array<{ file: string; imports: number }>;
  edges?: Array<{ from: string; to: string }>;
  cycles?: string[][];
  critical?: Array<{ path: string; lines: number }>;
  violations?: Array<{ file: string; type: string; count: number }>;
  deps?: Array<{ name: string; version: string; category: string }>;
  barrels?: Array<{ file: string; reExportCount: number }>;
  godComponents?: Array<{
    file: string;
    lines: number;
    imports: number;
    hooks: number;
    jsxReturns: number;
    reasons: string[];
  }>;
}

export interface ScanResponse {
  scanId: string;
  prevScore: number;
  currentScore: number;
  delta: number;
  trend: 'up' | 'down' | 'stable';
  insights: string[];
}

const SCAN_HEADER = '@few v1.1 domain:archradar';

// Escape/unescape delimiter characters (pipe and colon) and backslash itself
// so user-provided strings (file paths, function names) can't corrupt the
// fewserial format. Format: \\ -> backslash, \| -> pipe, \: -> colon.
function escapeValue(v: string | number): string {
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/:/g, '\\:')
    .replace(/\n/g, '\\n');
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

// Split a line on unescaped pipes. Does not treat `\|` as a separator.
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

function kv(fields: Record<string, string | number | undefined>): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}:${escapeValue(v as string | number)}`)
    .join('|');
}

function parseKv(line: string): Record<string, string> {
  return Object.fromEntries(
    splitUnescaped(line, '|').map((pair) => {
      // Find the first unescaped colon as the separator.
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
    MOD: data.modularityScore,
    SCN: data.scanId,
    TST: data.timestamp ?? Date.now(),
    MOD2: data.mode,
  });

  const sections: string[] = [];

  for (const h of data.hotspots ?? []) {
    sections.push(`→hot|${kv({ FIL: h.file, FNC: h.fn, SCX: h.score })}`);
  }
  for (const c of data.coupling ?? []) {
    sections.push(`→cpl|${kv({ FIL: c.file, IMP: c.imports })}`);
  }
  for (const e of data.edges ?? []) {
    sections.push(`→edg|${kv({ FRM: e.from, TO: e.to })}`);
  }
  for (const cyc of data.cycles ?? []) {
    sections.push(`→cyc|${kv({ CHN: cyc.join(',') })}`);
  }
  for (const cr of data.critical ?? []) {
    sections.push(`→crt|${kv({ FIL: cr.path, LNS: cr.lines })}`);
  }
  for (const v of data.violations ?? []) {
    sections.push(`→vio|${kv({ FIL: v.file, TYP: v.type, CNT: v.count })}`);
  }
  for (const d of data.deps ?? []) {
    sections.push(`→dep|${kv({ NAM: d.name, VER: d.version, CAT: d.category })}`);
  }
  for (const b of data.barrels ?? []) {
    sections.push(`→bar|${kv({ FIL: b.file, REX: b.reExportCount })}`);
  }
  for (const g of data.godComponents ?? []) {
    sections.push(
      `→god|${kv({
        FIL: g.file,
        LNS: g.lines,
        IMP: g.imports,
        HKS: g.hooks,
        JSX: g.jsxReturns,
        RSN: g.reasons.join(';'),
      })}`
    );
  }

  return [SCAN_HEADER, main, ...sections].filter(Boolean).join('\n');
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
