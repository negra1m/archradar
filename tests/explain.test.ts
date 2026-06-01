/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * v1.5 — `--explain` integrity tests.
 *
 * The explanation is only credible if its arithmetic reproduces the headline
 * score exactly. These tests assert the identity that `--explain` promises the
 * user: the components, penalties, and ceiling shown ARE how the score was
 * derived — not a parallel approximation.
 *
 * Run with:
 *   npx ts-node --esm tests/explain.test.ts
 * Or after build:
 *   node --test dist-tests/tests/explain.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateHealthScore } from '../src/core/scoring/healthScore.js';
import type { ScanResult, AnalysisResult } from '../src/types/index.js';

function mockScan(overrides: Partial<ScanResult['files']> = {}, framework = '__test__'): ScanResult {
  const totalFiles = overrides.totalFiles ?? 100;
  const testFileCount = overrides.testFileCount ?? Math.round(totalFiles * 0.4);
  return {
    projectPath: '/fake',
    framework: { framework, version: '14.0.0', bundler: 'Webpack' },
    files: {
      totalFiles,
      avgLinesPerFile: 80,
      criticalFiles: [],
      sourceFileCount: totalFiles,
      testFileCount,
      testCoverageRatio: totalFiles > 0 ? testFileCount / totalFiles : 0,
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
    complexity: { avgComplexity: 3, p95Complexity: 3, maxFunctionLines: 0, hotspots: [] },
    coupling: { avgCoupling: 4, highCouplingFiles: [], perFileImports: [] },
    circularDeps: { hasCycles: false, cycles: [], allCycles: [], graph: {}, typeOnlyImportsFiltered: 0 },
    modularity: { modularityScore: 100, applicable: true, issues: [], violations: [] },
    techDebt: {
      totalMarkers: 0,
      byType: {
        todo: 0, fixme: 0, hack: 0, xxx: 0, bug: 0, deprecated: 0,
        'ts-ignore': 0, 'ts-expect-error': 0, 'ts-nocheck': 0, 'eslint-disable': 0,
      },
      densityPerKLoc: 0,
      highDensityFiles: [],
      sourceLoc: 10000,
    },
    dataFlow: { sharedMutables: [], importTimeSideEffects: [], mutableSingletons: [] },
    ...overrides,
  };
}

// The core invariant: explanation.finalScore must equal health.score, and the
// arithmetic shown (weightedSum − penalties, capped by ceiling) must rebuild it.
function assertIdentity(scan: ScanResult, analysis: AnalysisResult): void {
  const { health, explanation: e } = calculateHealthScore(scan, analysis);

  // 1. The headline number IS the explained number.
  assert.equal(e.finalScore, health.score, 'finalScore must mirror health.score');
  assert.equal(e.grade, health.grade, 'explained grade must mirror health.grade');

  // 2. weightedSum reconstructs from the component contributions.
  const sumContrib = e.components.reduce((s, c) => s + c.contribution, 0);
  assert.ok(
    Math.abs(sumContrib - e.weightedSum) <= 0.5,
    `component contributions (${sumContrib.toFixed(1)}) must sum to weightedSum (${e.weightedSum})`
  );

  // 3. afterPenalty = max(0, round(weightedSum) − Σpenalties).
  const penaltyTotal = e.penalties.reduce((s, p) => s + p.points, 0);
  const expectedAfter = Math.max(0, Math.round(e.weightedSum) - penaltyTotal);
  assert.equal(e.afterPenalty, expectedAfter, 'afterPenalty must equal round(weightedSum) − penalties');

  // 4. finalScore = min(afterPenalty, ceiling).
  assert.equal(
    e.finalScore,
    Math.min(e.afterPenalty, e.ceiling.value),
    'finalScore must equal min(afterPenalty, ceiling)'
  );

  // 5. ceiling.applied flag is truthful.
  assert.equal(e.ceiling.applied, e.afterPenalty > e.ceiling.value, 'ceiling.applied flag must be truthful');
}

test('explain: identity holds for a pristine project', () => {
  assertIdentity(mockScan(), mockAnalysis());
});

test('explain: identity holds with penalties applied', () => {
  const analysis = mockAnalysis({
    techDebt: {
      totalMarkers: 50,
      byType: {
        todo: 30, fixme: 10, hack: 0, xxx: 0, bug: 0, deprecated: 0,
        'ts-ignore': 10, 'ts-expect-error': 0, 'ts-nocheck': 0, 'eslint-disable': 0,
      },
      densityPerKLoc: 5,
      highDensityFiles: [{ file: 'bad.ts', count: 20 }],
      sourceLoc: 10000,
    },
    dataFlow: {
      sharedMutables: [{ file: 'state.ts', name: 'cache' } as any],
      importTimeSideEffects: [],
      mutableSingletons: [{ file: 'reg.ts', name: 'registry' } as any],
    },
  });
  assertIdentity(mockScan(), analysis);
});

test('explain: identity holds when the size ceiling binds', () => {
  // Tiny project — ceiling caps the score below the weighted average.
  assertIdentity(mockScan({ totalFiles: 1, avgLinesPerFile: 20 }), mockAnalysis());
});

test('explain: identity holds when modularity/tests are null (weight redistributed)', () => {
  const scan = mockScan({ totalFiles: 15, sourceFileCount: 15, testFileCount: 0, testCoverageRatio: 0 });
  const analysis = mockAnalysis({
    modularity: { modularityScore: null, applicable: false, issues: [], violations: [] },
  });
  assertIdentity(scan, analysis);
  const { explanation: e } = calculateHealthScore(scan, analysis);
  // Neither nulled component should appear in the explanation rows.
  assert.ok(!e.components.some((c) => c.key === 'modularity'), 'modularity row must be omitted when null');
  assert.ok(!e.components.some((c) => c.key === 'tests'), 'tests row must be omitted when null');
});

test('explain: identity holds for a catastrophic project (floored)', () => {
  const scan = mockScan({
    avgLinesPerFile: 1000,
    totalFiles: 100,
    criticalFiles: Array.from({ length: 100 }, (_, i) => ({ path: `f${i}.ts`, lines: 1000, sizeBytes: 99999 })),
  });
  const analysis = mockAnalysis({
    coupling: { avgCoupling: 30, highCouplingFiles: [], perFileImports: [] },
    complexity: { avgComplexity: 20, p95Complexity: 50, maxFunctionLines: 0, hotspots: [] },
    modularity: { modularityScore: 0, applicable: true, issues: [], violations: [] },
  });
  assertIdentity(scan, analysis);
});

test('explain: community-calibrated framework reports its sample size', () => {
  const { explanation: e } = calculateHealthScore(
    mockScan({}, 'Next.js'),
    mockAnalysis()
  );
  assert.equal(e.calibration.framework, 'Next.js');
  assert.equal(e.calibration.source, 'community');
  assert.ok(typeof e.calibration.sampleSize === 'number', 'community calibration must expose N');
});

test('explain: unknown framework is flagged as fallback / low confidence', () => {
  const { explanation: e } = calculateHealthScore(mockScan(), mockAnalysis()); // __test__
  assert.equal(e.calibration.source, 'fallback');
  assert.equal(e.calibration.sampleSize, null);
  assert.equal(e.calibration.lowConfidence, true);
});
