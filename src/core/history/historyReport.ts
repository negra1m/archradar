// v1.5 — Local history rendering: the one-line delta shown after a scan, and
// the full `archradar history` view (sparkline + table). All offline.

import chalk from 'chalk';
import { Snapshot } from './snapshotStore.js';

function formatDate(ts: number): string {
  // YYYY-MM-DD — stable, locale-independent.
  return new Date(ts).toISOString().slice(0, 10);
}

/**
 * One-line "score vs last scan" delta, shown inline after a normal scan.
 * Returns null when there's nothing meaningful to show (no prior snapshot).
 * When the previous snapshot was produced under a different scoring version,
 * we refuse to report a delta — comparing across formula changes would be a
 * lie — and say so instead.
 */
export function deltaLine(current: number, prev: Snapshot, currentVersion: string): string {
  if (prev.scoringVersion && prev.scoringVersion !== currentVersion) {
    return (
      chalk.dim('  Δ ') +
      chalk.yellow(
        `previous scan used scoring v${prev.scoringVersion} (now v${currentVersion}) — not directly comparable`
      )
    );
  }
  const delta = current - prev.score;
  const since = formatDate(prev.timestamp);
  if (delta === 0) {
    return chalk.dim(`  Δ no change since ${since} (${prev.score})`);
  }
  const up = delta > 0;
  const arrow = up ? '▲' : '▼';
  const color = up ? chalk.green : chalk.red;
  const sign = up ? '+' : '';
  return (
    chalk.dim('  Δ ') +
    color(`${arrow} ${sign}${delta}`) +
    chalk.dim(` since ${since} (was ${prev.score})`)
  );
}

// Sparkline using Unicode block ramp. Scales across the observed min..max so
// small movements are still visible. A flat history renders as a flat line.
const RAMP = '▁▂▃▄▅▆▇█';

function sparkline(values: number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v) => {
      const idx = Math.round(((v - min) / span) * (RAMP.length - 1));
      return RAMP[idx];
    })
    .join('');
}

function gradeColor(grade: string): (s: string) => string {
  const map: Record<string, (s: string) => string> = {
    A: chalk.green,
    B: chalk.cyan,
    C: chalk.yellow,
    D: chalk.red,
    F: chalk.bgRed.white,
  };
  return map[grade] ?? chalk.white;
}

/** Full `archradar history` view. */
export function renderHistory(snaps: Snapshot[]): void {
  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log(chalk.bold('  ARCHRADAR HISTORY') + chalk.dim('  (local, offline)'));
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log('');

  if (snaps.length === 0) {
    console.log(chalk.dim('  No history yet. Run ') + chalk.cyan('archradar scan') + chalk.dim(' to record the first snapshot.'));
    console.log('');
    return;
  }

  const scores = snaps.map((s) => s.score);
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const net = last.score - first.score;

  // Sparkline summary.
  console.log(
    '  ' +
      chalk.cyan(sparkline(scores)) +
      '   ' +
      chalk.dim(`${snaps.length} scans, ${formatDate(first.timestamp)} → ${formatDate(last.timestamp)}`)
  );
  const netColor = net > 0 ? chalk.green : net < 0 ? chalk.red : chalk.dim;
  console.log('  ' + chalk.dim('net: ') + netColor(`${net > 0 ? '+' : ''}${net}`) + chalk.dim(` (${first.score} → ${last.score})`));
  console.log('');

  // Table — most recent first, capped at 15 rows.
  console.log(
    '  ' +
      chalk.dim('date'.padEnd(12)) +
      chalk.dim('score'.padStart(6)) +
      chalk.dim('  grade'.padStart(8)) +
      chalk.dim('  commit'.padStart(10)) +
      chalk.dim('  files'.padStart(8))
  );
  console.log(chalk.dim('  ' + '┄'.repeat(44)));

  const recent = [...snaps].reverse().slice(0, 15);
  let prev: Snapshot | null = null;
  for (let i = 0; i < recent.length; i++) {
    const s = recent[i];
    // The "next" older snapshot in chronological order, for per-row delta.
    const older = recent[i + 1] ?? null;
    const deltaStr =
      older && older.scoringVersion === s.scoringVersion
        ? (() => {
            const d = s.score - older.score;
            if (d === 0) return chalk.dim(' ·');
            return d > 0 ? chalk.green(` ▲${d}`) : chalk.red(` ▼${Math.abs(d)}`);
          })()
        : '';
    console.log(
      '  ' +
        chalk.white(formatDate(s.timestamp).padEnd(12)) +
        chalk.bold(String(s.score).padStart(6)) +
        gradeColor(s.grade)(`  ${s.grade}`.padStart(8)) +
        chalk.dim(`  ${s.commit || '—'}`.padStart(10)) +
        chalk.dim(`  ${s.totalFiles}`.padStart(8)) +
        deltaStr
    );
    prev = s;
  }
  void prev;

  // Honesty: flag mixed scoring versions in the window.
  const versions = new Set(snaps.map((s) => s.scoringVersion).filter(Boolean));
  if (versions.size > 1) {
    console.log('');
    console.log(
      chalk.yellow('  ⚠ ') +
        chalk.dim(
          `History spans scoring versions ${[...versions].sort().join(', ')}. ` +
            `Scores across a formula change aren't directly comparable.`
        )
    );
  }
  console.log('');
}
