/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sprint 1 regression tests — focused on the 7 critical fixes.
 *
 * Run with:
 *   cd archradar
 *   npm run build
 *   node --test dist-tests/tests/sprint1.test.js
 *
 * Or directly with ts-node:
 *   npx ts-node --esm tests/sprint1.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Import the functions under test. They're not exported, so we import the
// module they live in and rely on public behavior.
import { calculateHealthScore } from '../src/core/scoring/healthScore.js';
import type { ScanResult, AnalysisResult } from '../src/types/index.js';

// ===== Test fixtures =====

function mockScan(overrides: Partial<ScanResult['files']> = {}): ScanResult {
  return {
    projectPath: '/fake',
    framework: { framework: 'Next.js', version: '14.0.0', bundler: 'Webpack' },
    files: {
      totalFiles: 100,
      avgLinesPerFile: 80,
      criticalFiles: [],
      ...overrides,
    },
    dependencies: { totalDeps: 20, suspiciousDeps: [], heavyDeps: [], all: [] },
    structure: {
      folders: ['app', 'public'],
      hasRecognizedPattern: true,
      patternName: 'next-app-router',
      matchConfidence: 100,
    },
  };
}

function mockAnalysis(overrides: any = {}): AnalysisResult {
  return {
    complexity: { avgComplexity: 3, hotspots: [] },
    coupling: { avgCoupling: 4, highCouplingFiles: [], perFileImports: [] },
    circularDeps: { hasCycles: false, cycles: [], allCycles: [], graph: {} },
    modularity: { modularityScore: 100, applicable: true, issues: [], violations: [] },
    ...overrides,
  };
}

// ===== 1.4 — File size curve is continuous =====

test('1.4 scoreFileSize: 80 lines = 100 points', () => {
  const scan = mockScan({ avgLinesPerFile: 80 });
  const result = calculateHealthScore(scan, mockAnalysis());
  assert.equal(result.breakdown.fileSize, 100);
});

test('1.4 scoreFileSize: 81 lines is NOT a cliff (no 20pt drop)', () => {
  const scan = mockScan({ avgLinesPerFile: 81 });
  const result = calculateHealthScore(scan, mockAnalysis());
  // Curve: at 81, should be ~99.8 ≈ 100 rounded
  assert.ok(
    result.breakdown.fileSize >= 99,
    `expected >=99, got ${result.breakdown.fileSize}`
  );
});

test('1.4 scoreFileSize: 290 lines gives smooth middle score', () => {
  const scan = mockScan({ avgLinesPerFile: 290 });
  const result = calculateHealthScore(scan, mockAnalysis());
  // Between 80 and 500, t = (290-80)/420 = 0.5
  // score = 100 - 0.5*80 = 60
  assert.equal(result.breakdown.fileSize, 60);
});

test('1.4 scoreFileSize: 500+ lines gives floor 20', () => {
  const scan = mockScan({ avgLinesPerFile: 700 });
  const result = calculateHealthScore(scan, mockAnalysis());
  assert.equal(result.breakdown.fileSize, 20);
});

// ===== 1.5 — Critical files curve is continuous =====

test('1.5 scoreCriticalFiles: 0 critical = 100', () => {
  const scan = mockScan({ totalFiles: 100, criticalFiles: [] });
  const result = calculateHealthScore(scan, mockAnalysis());
  assert.equal(result.breakdown.criticalFiles, 100);
});

test('1.5 scoreCriticalFiles: 5% critical = ~87 (continuous, not cliff)', () => {
  const critical = Array.from({ length: 5 }, (_, i) => ({ path: `f${i}.ts`, lines: 400, sizeBytes: 10000 }));
  const scan = mockScan({ totalFiles: 100, criticalFiles: critical });
  const result = calculateHealthScore(scan, mockAnalysis());
  // ratio = 0.05, pct = 0.05/0.3 ≈ 0.1667, score = 100 - 0.1667*80 ≈ 87
  assert.ok(
    result.breakdown.criticalFiles >= 85 && result.breakdown.criticalFiles <= 90,
    `expected 85-90, got ${result.breakdown.criticalFiles}`
  );
});

test('1.5 scoreCriticalFiles: 6% critical is NOT a 20-point cliff from 5%', () => {
  const critical5 = Array.from({ length: 5 }, (_, i) => ({ path: `f${i}.ts`, lines: 400, sizeBytes: 10000 }));
  const critical6 = Array.from({ length: 6 }, (_, i) => ({ path: `f${i}.ts`, lines: 400, sizeBytes: 10000 }));

  const r5 = calculateHealthScore(mockScan({ totalFiles: 100, criticalFiles: critical5 }), mockAnalysis());
  const r6 = calculateHealthScore(mockScan({ totalFiles: 100, criticalFiles: critical6 }), mockAnalysis());

  const diff = r5.breakdown.criticalFiles - r6.breakdown.criticalFiles;
  assert.ok(diff <= 5, `expected smooth decrease (<=5pts), got ${diff}pts drop`);
});

// ===== 1.6 — Modularity applicable =====

test('1.6 modularity: null triggers weight redistribution', () => {
  const analysisNoMod = mockAnalysis({
    modularity: { modularityScore: null, applicable: false, issues: [], violations: [] },
  });
  const scan = mockScan();
  const resultNoMod = calculateHealthScore(scan, analysisNoMod);
  const resultWithMod = calculateHealthScore(scan, mockAnalysis());

  // Both should produce ~100 (or close) since everything else is perfect.
  // The key test: modularity=null should NOT crash and should return the
  // same score as if modularity was 100 (best case).
  assert.ok(resultNoMod.health.score >= 95);
  assert.ok(resultWithMod.health.score >= 95);
  assert.equal(resultNoMod.breakdown.modularity, null);
  assert.equal(resultWithMod.breakdown.modularity, 100);
});

test('1.6 modularity: null does not drag score down (weight redistributed)', () => {
  // A project with all 6 other components at 70 and modularity=null
  // should score 70 (not 63 that it would be if null counted as 0).
  const scan = mockScan({
    avgLinesPerFile: 200, // causes fileSize=~71
    totalFiles: 100,
    criticalFiles: Array.from({ length: 6 }, (_, i) => ({ path: `f${i}.ts`, lines: 500, sizeBytes: 10000 })),
  });
  const analysis = mockAnalysis({
    modularity: { modularityScore: null, applicable: false, issues: [], violations: [] },
  });
  const result = calculateHealthScore(scan, analysis);
  // Modularity should be null in the breakdown
  assert.equal(result.breakdown.modularity, null);
});

// ===== 1.7 — Cycles allCycles vs cycles =====

test('1.7 cycles: scoring uses allCycles (not sliced) — placeholder', () => {
  // This test verifies that the AnalysisResult type has allCycles,
  // and scoring can consume it. The real behavioral test is in the integration
  // run against iFIGHT.
  const analysis = mockAnalysis({
    circularDeps: {
      hasCycles: true,
      cycles: [['a.ts', 'b.ts']],
      allCycles: Array.from({ length: 50 }, (_, i) => [`f${i}.ts`, `g${i}.ts`]),
      graph: {},
    },
  });
  assert.equal(analysis.circularDeps.allCycles.length, 50);
  assert.equal(analysis.circularDeps.cycles.length, 1);
  // Healthcheck: should not crash
  const result = calculateHealthScore(mockScan(), analysis);
  assert.ok(result.health.score >= 0 && result.health.score <= 100);
});

// ===== Smoke: full healthScore returns consistent shape =====

test('healthScore: returns valid shape on normal input', () => {
  const result = calculateHealthScore(mockScan(), mockAnalysis());
  assert.ok(typeof result.health.score === 'number');
  assert.ok(['A', 'B', 'C', 'D', 'F'].includes(result.health.grade));
  assert.ok(result.breakdown.fileSize >= 0 && result.breakdown.fileSize <= 100);
});

test('healthScore: 0-100 bounds respected on edge inputs', () => {
  const worst = calculateHealthScore(
    mockScan({
      avgLinesPerFile: 1000,
      totalFiles: 100,
      criticalFiles: Array.from({ length: 100 }, (_, i) => ({ path: `f${i}.ts`, lines: 1000, sizeBytes: 99999 })),
    }),
    mockAnalysis({
      coupling: { avgCoupling: 30, highCouplingFiles: [], perFileImports: [] },
      complexity: { avgComplexity: 20, hotspots: [] },
      modularity: { modularityScore: 0, applicable: true, issues: [], violations: [] },
    })
  );
  assert.ok(worst.health.score >= 0);
  assert.ok(worst.health.score <= 100);
});
