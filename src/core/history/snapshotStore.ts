// v1.5 — Local scan history. 100% offline.
//
// archradar's DESIGN.md promises "the same codebase scored yesterday vs.
// today tells you whether you improved or regressed". Until now that trend
// only existed server-side (premium). This store delivers it with zero
// network and zero account: every `scan` appends a tiny snapshot to
// `.archradar/history/`, and the next scan reads the latest one to show a
// delta.
//
// Storage is FEW-AI-SERIAL (.fewserial), per Few Company convention — never
// JSON for internal storage. One snapshot = one append-only file named by
// timestamp so the directory is naturally chronological and never rewritten.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { Grade, ScoreResult } from '../../types/index.js';
import { SCORING_VERSION } from '../scoring/healthScore.js';

const HISTORY_DIR = path.join('.archradar', 'history');
const HEADER = '@few v1 domain:archradar-history';

export interface Snapshot {
  /** Epoch millis when the scan ran. */
  timestamp: number;
  score: number;
  grade: Grade;
  /** Scoring formula version this snapshot was produced under. Snapshots from
   *  a different version are NOT directly comparable — we surface that. */
  scoringVersion: string;
  framework: string;
  totalFiles: number;
  /** Short git commit hash at scan time, or '' when not a git repo. */
  commit: string;
  /** Key component scores, kept for richer history views. */
  coupling: number;
  complexity: number;
  /** File stem (without dir/ext) — lets callers reference a snapshot. */
  id: string;
}

function escape(v: string | number): string {
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/:/g, '\\:')
    .replace(/\n/g, '\\n');
}

function unescape(v: string): string {
  let out = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && i + 1 < v.length) {
      const n = v[i + 1];
      out += n === '\\' ? '\\' : n === '|' ? '|' : n === ':' ? ':' : n === 'n' ? '\n' : n;
      i++;
      continue;
    }
    out += v[i];
  }
  return out;
}

function parseKv(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  let field = '';
  const fields: string[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && i + 1 < line.length) {
      field += line[i] + line[i + 1];
      i++;
      continue;
    }
    if (line[i] === '|') {
      fields.push(field);
      field = '';
      continue;
    }
    field += line[i];
  }
  fields.push(field);
  for (const pair of fields) {
    const idx = pair.indexOf(':');
    if (idx === -1) continue;
    out[pair.slice(0, idx)] = unescape(pair.slice(idx + 1));
  }
  return out;
}

function readGitCommit(projectPath: string): string {
  try {
    if (!fs.existsSync(path.join(projectPath, '.git'))) return '';
    const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: projectPath,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.toString().trim();
  } catch {
    return '';
  }
}

/** Build a snapshot from a score result. `timestamp` is injected so callers
 *  control the clock (and tests stay deterministic). */
export function buildSnapshot(
  projectPath: string,
  score: ScoreResult,
  framework: string,
  totalFiles: number,
  timestamp: number
): Snapshot {
  // File-safe sortable id: 2026-06-01T1432-03 style without illegal chars.
  const id = String(timestamp);
  return {
    timestamp,
    score: score.health.score,
    grade: score.health.grade,
    scoringVersion: SCORING_VERSION,
    framework,
    totalFiles,
    commit: readGitCommit(projectPath),
    coupling: score.breakdown.coupling,
    complexity: score.breakdown.complexity,
    id,
  };
}

function encode(s: Snapshot): string {
  const main = [
    `TST:${escape(s.timestamp)}`,
    `SCR:${escape(s.score)}`,
    `GRD:${escape(s.grade)}`,
    `SVR:${escape(s.scoringVersion)}`,
    `FWK:${escape(s.framework)}`,
    `TFL:${escape(s.totalFiles)}`,
    `CMT:${escape(s.commit)}`,
    `CPL:${escape(s.coupling)}`,
    `CMX:${escape(s.complexity)}`,
  ].join('|');
  return `${HEADER}\n${main}\n`;
}

function decode(raw: string, id: string): Snapshot | null {
  const line = raw.split('\n').find((l) => l.trim() && !l.startsWith('@few'));
  if (!line) return null;
  const f = parseKv(line);
  if (!f['TST']) return null;
  return {
    timestamp: Number(f['TST']),
    score: Number(f['SCR']),
    grade: (f['GRD'] || 'F') as Grade,
    scoringVersion: f['SVR'] || '',
    framework: f['FWK'] || 'Unknown',
    totalFiles: Number(f['TFL'] || 0),
    commit: f['CMT'] || '',
    coupling: Number(f['CPL'] || 0),
    complexity: Number(f['CMX'] || 0),
    id,
  };
}

/** Persist a snapshot. Creates `.archradar/history/` if needed. Best-effort:
 *  a write failure must never break a scan, so callers can ignore throws. */
export function saveSnapshot(projectPath: string, snapshot: Snapshot): string {
  const dir = path.join(projectPath, HISTORY_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${snapshot.id}.fewserial`);
  fs.writeFileSync(file, encode(snapshot));
  return file;
}

/** Read all snapshots, oldest first. Returns [] when no history exists. */
export function readHistory(projectPath: string): Snapshot[] {
  const dir = path.join(projectPath, HISTORY_DIR);
  if (!fs.existsSync(dir)) return [];
  const snaps: Snapshot[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.fewserial')) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, name), 'utf-8');
      const s = decode(raw, name.replace(/\.fewserial$/, ''));
      if (s) snaps.push(s);
    } catch {
      // Skip corrupt snapshot files rather than failing the whole read.
    }
  }
  // Sort by timestamp ascending — deterministic regardless of readdir order.
  snaps.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  return snaps;
}

/** The most recent snapshot strictly before `beforeTs`, or null. Used to show
 *  "delta since last scan" without comparing a scan to itself. */
export function previousSnapshot(projectPath: string, beforeTs: number): Snapshot | null {
  const all = readHistory(projectPath);
  const prior = all.filter((s) => s.timestamp < beforeTs);
  return prior.length > 0 ? prior[prior.length - 1] : null;
}

/** Look up a snapshot by id (filename stem) or short commit hash. For --baseline. */
export function findSnapshot(projectPath: string, ref: string): Snapshot | null {
  const all = readHistory(projectPath);
  return (
    all.find((s) => s.id === ref) ??
    all.find((s) => s.commit && s.commit === ref) ??
    null
  );
}
