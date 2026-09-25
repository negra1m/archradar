/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * v1.5 — Local history store tests.
 *
 * Run after build:
 *   node --test dist-tests/tests/history.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildSnapshot,
  saveSnapshot,
  readHistory,
  previousSnapshot,
  findSnapshot,
  type Snapshot,
} from '../src/core/history/snapshotStore.js';
import { deltaLine } from '../src/core/history/historyReport.js';
import type { ScoreResult } from '../src/types/index.js';

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'archradar-hist-'));
}

function mockScore(score: number): ScoreResult {
  return {
    health: { score, grade: score >= 70 ? 'B' : 'D' },
    recommendations: [],
    breakdown: {
      fileSize: 80, criticalFiles: 80, structure: 100, dependencies: 100,
      coupling: 70, complexity: 60, worstFile: 80, modularity: 100, tests: 80,
    },
    explanation: {
      components: [], totalWeight: 1, weightedSum: score, penalties: [],
      afterPenalty: score,
      ceiling: { value: 100, totalFiles: 100, applied: false },
      finalScore: score, grade: score >= 70 ? 'B' : 'D',
      calibration: { framework: 'React', source: 'community', sampleSize: 25, lowConfidence: false },
    },
  };
}

test('history: save then read round-trips the snapshot', () => {
  const dir = tmpProject();
  const snap = buildSnapshot(dir, mockScore(72), 'React', 100, 1_700_000_000_000);
  saveSnapshot(dir, snap);

  const back = readHistory(dir);
  assert.equal(back.length, 1);
  assert.equal(back[0].score, 72);
  assert.equal(back[0].grade, 'B');
  assert.equal(back[0].framework, 'React');
  assert.equal(back[0].totalFiles, 100);
  assert.equal(back[0].scoringVersion, snap.scoringVersion);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('history: snapshots are stored as .fewserial, not JSON', () => {
  const dir = tmpProject();
  saveSnapshot(dir, buildSnapshot(dir, mockScore(60), 'Vue', 50, 1_700_000_000_000));
  const histDir = path.join(dir, '.archradar', 'history');
  const files = fs.readdirSync(histDir);
  assert.ok(files.every((f) => f.endsWith('.fewserial')), 'all snapshots must be .fewserial');
  const raw = fs.readFileSync(path.join(histDir, files[0]), 'utf-8');
  assert.ok(raw.startsWith('@few'), 'snapshot must carry the FEW-AI-SERIAL header');
  assert.ok(!raw.trimStart().startsWith('{'), 'snapshot must not be JSON');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('history: readHistory returns snapshots oldest-first regardless of write order', () => {
  const dir = tmpProject();
  // Write out of chronological order.
  saveSnapshot(dir, buildSnapshot(dir, mockScore(70), 'React', 100, 3000));
  saveSnapshot(dir, buildSnapshot(dir, mockScore(50), 'React', 100, 1000));
  saveSnapshot(dir, buildSnapshot(dir, mockScore(60), 'React', 100, 2000));
  const all = readHistory(dir);
  assert.deepEqual(all.map((s) => s.timestamp), [1000, 2000, 3000]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('history: previousSnapshot returns the latest strictly before a timestamp', () => {
  const dir = tmpProject();
  saveSnapshot(dir, buildSnapshot(dir, mockScore(50), 'React', 100, 1000));
  saveSnapshot(dir, buildSnapshot(dir, mockScore(60), 'React', 100, 2000));
  // Current scan at t=3000 should compare to the t=2000 snapshot, not itself.
  const prev = previousSnapshot(dir, 3000);
  assert.ok(prev);
  assert.equal(prev!.timestamp, 2000);
  assert.equal(prev!.score, 60);
  // No prior snapshot before the very first one.
  assert.equal(previousSnapshot(dir, 1000), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('history: findSnapshot resolves by id', () => {
  const dir = tmpProject();
  const snap = buildSnapshot(dir, mockScore(65), 'React', 100, 1_700_000_055_000);
  saveSnapshot(dir, snap);
  const found = findSnapshot(dir, snap.id);
  assert.ok(found);
  assert.equal(found!.score, 65);
  assert.equal(findSnapshot(dir, 'nonexistent'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('history: readHistory on a project with no history returns []', () => {
  const dir = tmpProject();
  assert.deepEqual(readHistory(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('history: corrupt snapshot file is skipped, not fatal', () => {
  const dir = tmpProject();
  saveSnapshot(dir, buildSnapshot(dir, mockScore(70), 'React', 100, 1000));
  const histDir = path.join(dir, '.archradar', 'history');
  fs.writeFileSync(path.join(histDir, 'garbage.fewserial'), 'not a valid snapshot');
  const all = readHistory(dir);
  assert.equal(all.length, 1, 'valid snapshot survives, garbage is skipped');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('deltaLine: refuses to compare across scoring versions', () => {
  const prev: Snapshot = {
    timestamp: 1_700_000_000_000, score: 80, grade: 'B', scoringVersion: '1.4',
    framework: 'React', totalFiles: 100, commit: '', coupling: 70, complexity: 60, id: '1',
  };
  const line = deltaLine(72, prev, '1.5');
  assert.ok(/not directly comparable/.test(line), 'cross-version delta must be flagged, not reported');
  // Same version → a real delta is shown.
  const sameVer: Snapshot = { ...prev, scoringVersion: '1.5' };
  const line2 = deltaLine(72, sameVer, '1.5');
  assert.ok(/8/.test(line2), 'same-version delta must show the numeric change (80→72 = -8)');
});
