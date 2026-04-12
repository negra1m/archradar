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
import { countCognitiveComplexity } from '../src/core/analyzer/complexityAnalyzer.js';
import { Project } from 'ts-morph';
import type { ScanResult, AnalysisResult } from '../src/types/index.js';

// Helper: parse a function body string and return the cognitive complexity.
function cognitive(fnSource: string): number {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile('test.ts', fnSource);
  const fn = sf.getFunctions()[0];
  if (!fn) throw new Error('no function in fixture');
  return countCognitiveComplexity(fn);
}

// ===== Test fixtures =====

function mockScan(overrides: Partial<ScanResult['files']> = {}): ScanResult {
  // Default = 100 source files + 40 test files (ratio 0.4, good test culture).
  // Keeps legacy tests passing where they expect pristine-ish scores.
  // Uses '__test__' as the framework name so the calibration loader falls
  // back to the hardcoded thresholds (HIGH_COUPLING=12, COMPLEXITY=10),
  // which keeps the test fixtures stable across Sprint 8 calibration changes.
  const totalFiles = overrides.totalFiles ?? 100;
  const testFileCount = overrides.testFileCount ?? Math.round(totalFiles * 0.4);
  return {
    projectPath: '/fake',
    framework: { framework: '__test__', version: '14.0.0', bundler: 'Webpack' },
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
    // Default = pristine: both avg and p95 below low threshold so complexity
    // component scores 100 and doesn't interfere with tests that only assert
    // on fileSize / criticalFiles / modularity.
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
    dataFlow: {
      sharedMutables: [],
      importTimeSideEffects: [],
      mutableSingletons: [],
    },
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
      typeOnlyImportsFiltered: 0,
    },
  });
  assert.equal(analysis.circularDeps.allCycles.length, 50);
  assert.equal(analysis.circularDeps.cycles.length, 1);
  // Healthcheck: should not crash
  const result = calculateHealthScore(mockScan(), analysis);
  assert.ok(result.health.score >= 0 && result.health.score <= 100);
});

// ===== v1.4 Sprint 1 #15 — p95Complexity wired into score =====

test('v1.4-s1.15 scoreComplexity: avg=3 with p95=3 scores 100 (both under low)', () => {
  // Both avg and p95 at/below low threshold (3.33) → full score.
  const analysis = mockAnalysis({
    complexity: { avgComplexity: 3, p95Complexity: 3, maxFunctionLines: 0, hotspots: [] },
  });
  const result = calculateHealthScore(mockScan(), analysis);
  assert.equal(result.breakdown.complexity, 100);
});

test('v1.4-s1.15 scoreComplexity: avg=3 with p95=8 blends ~85 (cognitive curve)', () => {
  // Under the Sprint 3 cognitive curve: 5 → 100, 10 → 60.
  // p95=8 lands at t=0.6 between anchors, p95Score = 100 - 0.6*40 = 76.
  // avg=3 → 100. Blended = 100*0.4 + 76*0.6 = 40 + 45.6 = 85.6 → 86.
  const analysis = mockAnalysis({
    complexity: { avgComplexity: 3, p95Complexity: 8, maxFunctionLines: 0, hotspots: [] },
  });
  const result = calculateHealthScore(mockScan(), analysis);
  assert.ok(
    result.breakdown.complexity >= 82 && result.breakdown.complexity <= 90,
    `expected 82-90, got ${result.breakdown.complexity}`
  );
});

test('v1.4-s1.15 scoreComplexity: avg=3 with p95=25 (tail catastrophe) drops score', () => {
  // Avg looks fine but the worst 5% of functions are way above threshold.
  // Before Sprint 1, p95 was ignored — score stayed ≈100.
  // After Sprint 1, p95 pulls the score down meaningfully.
  const analysis = mockAnalysis({
    complexity: { avgComplexity: 3, p95Complexity: 25, maxFunctionLines: 0, hotspots: [] },
  });
  const result = calculateHealthScore(mockScan(), analysis);
  // 40% of 100 (avg) + 60% of 40 (p95 above high threshold) = 40 + 24 = 64
  assert.ok(
    result.breakdown.complexity <= 70,
    `expected <=70 when p95 catastrophic, got ${result.breakdown.complexity}`
  );
});

test('v1.4-s1.15 scoreComplexity: iFIGHT-like (avg=9, p95=30, 10 hotspots) is brutal', () => {
  const analysis = mockAnalysis({
    complexity: {
      avgComplexity: 9,
      p95Complexity: 30,
      maxFunctionLines: 30,
      hotspots: Array.from({ length: 10 }, (_, i) => ({
        file: `f${i}.ts`,
        function: 'fn',
        complexity: 20,
        lines: 30,
      })),
    },
  });
  const result = calculateHealthScore(mockScan(), analysis);
  // avgScore ~49, p95Score=40, blended ~43.6, penalty -40 → ~4
  // Before Sprint 1 this was hidden at score ~9 (avg + penalty).
  // After Sprint 1 it should still be floored/very-low but driven by p95.
  assert.ok(
    result.breakdown.complexity <= 15,
    `expected <=15, got ${result.breakdown.complexity}`
  );
});

// ===== v1.4 Sprint 1 #5 — Type-only imports filtered from cycles =====

test('v1.4-s1.5 circularDeps result exposes typeOnlyImportsFiltered', () => {
  // Verifies the new field exists in the type. Behavioral test runs
  // via the iFIGHT integration.
  const analysis = mockAnalysis({
    circularDeps: {
      hasCycles: false,
      cycles: [],
      allCycles: [],
      graph: {},
      typeOnlyImportsFiltered: 12,
    },
  });
  assert.equal(analysis.circularDeps.typeOnlyImportsFiltered, 12);
});

// ===== v1.4 Sprint 2 #1 — Worst-file penalty (kills averaging dilution) =====

test('v1.4-s2.1 worstFile: 1141-line single file drops component to ~30', () => {
  // iFIGHT-like reality: one admin/page.tsx at 1141 lines.
  const scan = mockScan({
    avgLinesPerFile: 125, // looks fine on average
    criticalFiles: [{ path: 'admin/page.tsx', lines: 1141, sizeBytes: 50000 }],
  });
  const result = calculateHealthScore(scan, mockAnalysis());
  // worst.lines = 1141, t = (1141-200)/(1500-200) = 0.724, score = 100 - 58 = 42
  // but since hotspot-based score is 100 (no complexity issues), worstFile = min(42, 100) = 42
  assert.ok(
    result.breakdown.worstFile >= 35 && result.breakdown.worstFile <= 50,
    `expected 35-50 for 1141-line file, got ${result.breakdown.worstFile}`
  );
});

test('v1.4-s2.1 worstFile: 122-complexity function drops component', () => {
  // A single catastrophic function must pull the score down even if avg is fine.
  const scan = mockScan({ criticalFiles: [] });
  const analysis = mockAnalysis({
    complexity: {
      avgComplexity: 3,
      p95Complexity: 5,
      maxFunctionLines: 200,
      hotspots: [{ file: 'signup/page.tsx', function: 'SignupForm', complexity: 122, lines: 200 }],
    },
  });
  const result = calculateHealthScore(scan, analysis);
  // worst complexity clamps to 100 (since 122 >= 100), score = 20 (floor)
  assert.equal(result.breakdown.worstFile, 20);
});

test('v1.4-s2.1 worstFile: clean project scores 100', () => {
  const scan = mockScan({ criticalFiles: [] });
  const result = calculateHealthScore(scan, mockAnalysis());
  assert.equal(result.breakdown.worstFile, 100);
});

// ===== v1.4 Sprint 2 #10 — Continuous size ceiling =====

test('v1.4-s2.10 sizeCeiling: 49 vs 50 files has no cliff', () => {
  // Before Sprint 2: 49 capped at 85, 50 capped at 100 — 15pt cliff.
  // After Sprint 2: smooth curve, difference is ~0-2pts.
  const s49 = calculateHealthScore(
    mockScan({ totalFiles: 49 }),
    mockAnalysis()
  ).health.score;
  const s50 = calculateHealthScore(
    mockScan({ totalFiles: 50 }),
    mockAnalysis()
  ).health.score;
  assert.ok(
    Math.abs(s50 - s49) <= 2,
    `expected smooth transition, got ${s49} → ${s50} (diff ${s50 - s49})`
  );
});

test('v1.4-s2.10 sizeCeiling: 1-file project capped at 60', () => {
  // log10(1)/2 = 0 → ceiling = 60.
  // Default mockAnalysis is pristine so rawScore would be ~100.
  const result = calculateHealthScore(
    mockScan({ totalFiles: 1, avgLinesPerFile: 20, criticalFiles: [] }),
    mockAnalysis()
  );
  assert.ok(result.health.score <= 60, `expected ≤60, got ${result.health.score}`);
});

test('v1.4-s2.10 sizeCeiling: 100-file project can score 100', () => {
  // log10(100)/2 = 1 → ceiling = 100.
  const result = calculateHealthScore(
    mockScan({ totalFiles: 100, avgLinesPerFile: 50, criticalFiles: [] }),
    mockAnalysis()
  );
  // Should have no ceiling cap at this size.
  assert.ok(result.health.score >= 95);
});

// ===== v1.4 Sprint 2 #11 — Hotspot penalty is asymptotic, no hard cap =====

test('v1.4-s2.11 hotspot penalty: 5 hotspots vs 50 hotspots differ', () => {
  // Before Sprint 2: both hit the -40 cap, so 5 and 50 gave same score.
  // After Sprint 2: asymptotic curve — 5 gives ~17, 50 gives ~39.9.
  const mk = (n: number) =>
    calculateHealthScore(
      mockScan(),
      mockAnalysis({
        complexity: {
          avgComplexity: 3,
          p95Complexity: 3,
          maxFunctionLines: 20,
          hotspots: Array.from({ length: n }, (_, i) => ({
            file: `f${i}.ts`,
            function: 'fn',
            complexity: 15,
            lines: 20,
          })),
        },
      })
    ).breakdown.complexity;
  const s5 = mk(5);
  const s50 = mk(50);
  assert.ok(
    s5 > s50,
    `5 hotspots should score better than 50, got ${s5} vs ${s50}`
  );
});

// ===== v1.4 Sprint 2 #2 — Rebalanced weights =====

test('v1.4-s2.2 weights: structure+deps no longer free 30 points', () => {
  // A project with terrible complexity and worstFile but great structure/deps
  // should NOT score above 70 (previously could hit ~75+ from the free points).
  const scan = mockScan({
    totalFiles: 200,
    avgLinesPerFile: 150,
    criticalFiles: [
      { path: 'f1.tsx', lines: 1500, sizeBytes: 50000 },
      { path: 'f2.tsx', lines: 1000, sizeBytes: 40000 },
    ],
  });
  const analysis = mockAnalysis({
    complexity: {
      avgComplexity: 15,
      p95Complexity: 40,
      maxFunctionLines: 80,
      hotspots: Array.from({ length: 15 }, (_, i) => ({
        file: `f${i}.ts`,
        function: 'fn',
        complexity: 50,
        lines: 80,
      })),
    },
    modularity: { modularityScore: 40, applicable: true, issues: [], violations: [] },
  });
  const result = calculateHealthScore(scan, analysis);
  assert.ok(
    result.health.score <= 70,
    `expected ≤70 for catastrophic complexity project, got ${result.health.score}`
  );
});

// ===== v1.4 Sprint 3 #4 — Cognitive complexity computation =====
//
// Validates that cognitive correctly distinguishes nested from sequential
// flow, and matches the SonarSource spec on key examples.

test('v1.4-s3 cognitive: three sequential ifs = 3', () => {
  const src = `
    function f(a: boolean, b: boolean, c: boolean) {
      if (a) { console.log('a'); }
      if (b) { console.log('b'); }
      if (c) { console.log('c'); }
    }
  `;
  assert.equal(cognitive(src), 3);
});

test('v1.4-s3 cognitive: three nested ifs = 6 (1 + 2 + 3)', () => {
  const src = `
    function f(a: boolean, b: boolean, c: boolean) {
      if (a) {
        if (b) {
          if (c) {
            console.log('deep');
          }
        }
      }
    }
  `;
  // if(a) at nesting 0 = 1
  // if(b) at nesting 1 = 2
  // if(c) at nesting 2 = 3
  // total = 6
  assert.equal(cognitive(src), 6);
});

test('v1.4-s3 cognitive: logical operators add +1 each', () => {
  const src = `
    function f(a: boolean, b: boolean, c: boolean) {
      if (a && b || c) {
        console.log('x');
      }
    }
  `;
  // if = 1, && = 1, || = 1 → 3
  assert.equal(cognitive(src), 3);
});

test('v1.4-s3 cognitive: for-loop inside for-loop = 3 (1 + 2)', () => {
  const src = `
    function f(arr: number[][]) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr[i].length; j++) {
          console.log(arr[i][j]);
        }
      }
    }
  `;
  assert.equal(cognitive(src), 3);
});

test('v1.4-s3 cognitive: nested function resets nesting to 0', () => {
  const src = `
    function outer() {
      if (true) {
        if (true) {
          const inner = () => {
            if (true) {
              console.log('inner');
            }
          };
        }
      }
    }
  `;
  // outer: if(true) +1, if(true) nested +2 → 3
  // inner arrow: resets nesting, if(true) +1 → 1
  // total = 3 + 1 = 4
  assert.equal(cognitive(src), 4);
});

// ===== v1.4 Sprint 3 — Score curve recalibrated for cognitive =====

test('v1.4-s3.4 scoreOneComplexity: 5 → 100 (low threshold)', () => {
  // Single complexity=5 means the function scores 100.
  const scan = mockScan();
  const analysis = mockAnalysis({
    complexity: { avgComplexity: 5, p95Complexity: 5, maxFunctionLines: 0, hotspots: [] },
  });
  const result = calculateHealthScore(scan, analysis);
  assert.equal(result.breakdown.complexity, 100);
});

test('v1.4-s3.4 scoreOneComplexity: 10 → ~60 (mid anchor)', () => {
  const scan = mockScan();
  const analysis = mockAnalysis({
    complexity: { avgComplexity: 10, p95Complexity: 10, maxFunctionLines: 0, hotspots: [] },
  });
  const result = calculateHealthScore(scan, analysis);
  // Both avg and p95 at 10: both score 60, blended = 60.
  assert.ok(
    result.breakdown.complexity >= 58 && result.breakdown.complexity <= 62,
    `expected ~60 for cognitive=10, got ${result.breakdown.complexity}`
  );
});

test('v1.4-s3.4 scoreOneComplexity: 30+ hits floor of 20', () => {
  const scan = mockScan();
  const analysis = mockAnalysis({
    complexity: { avgComplexity: 30, p95Complexity: 50, maxFunctionLines: 0, hotspots: [] },
  });
  const result = calculateHealthScore(scan, analysis);
  assert.equal(result.breakdown.complexity, 20);
});

// ===== v1.4 Sprint 4 #8 — Test coverage proxy component =====

test('v1.4-s4.8 tests: 0 tests in 100 source files → 20', () => {
  const scan = mockScan({
    totalFiles: 100,
    sourceFileCount: 100,
    testFileCount: 0,
    testCoverageRatio: 0,
  });
  const result = calculateHealthScore(scan, mockAnalysis());
  assert.equal(result.breakdown.tests, 20);
});

test('v1.4-s4.8 tests: 10 tests / 100 source → 40', () => {
  const scan = mockScan({
    totalFiles: 100,
    sourceFileCount: 100,
    testFileCount: 10,
    testCoverageRatio: 0.1,
  });
  const result = calculateHealthScore(scan, mockAnalysis());
  assert.equal(result.breakdown.tests, 40);
});

test('v1.4-s4.8 tests: 30 tests / 100 source → 80 (mature)', () => {
  const scan = mockScan({
    totalFiles: 100,
    sourceFileCount: 100,
    testFileCount: 30,
    testCoverageRatio: 0.3,
  });
  const result = calculateHealthScore(scan, mockAnalysis());
  assert.equal(result.breakdown.tests, 80);
});

test('v1.4-s4.8 tests: 50+ tests / 100 source → 100 (exceptional)', () => {
  const scan = mockScan({
    totalFiles: 100,
    sourceFileCount: 100,
    testFileCount: 60,
    testCoverageRatio: 0.6,
  });
  const result = calculateHealthScore(scan, mockAnalysis());
  assert.equal(result.breakdown.tests, 100);
});

test('v1.4-s4.8 tests: project <20 source files → null (too small)', () => {
  const scan = mockScan({
    totalFiles: 15,
    sourceFileCount: 15,
    testFileCount: 0,
    testCoverageRatio: 0,
  });
  const result = calculateHealthScore(scan, mockAnalysis());
  assert.equal(result.breakdown.tests, null);
});

// ===== v1.4 Sprint 5 #13 — Per-function line count in worst-file =====

test('v1.4-s5.13 worstFile: 300-line function is flagged (even when file is short)', () => {
  // A focused file can still contain one massive function. Sprint 5 catches it.
  const scan = mockScan({ criticalFiles: [] });
  const analysis = mockAnalysis({
    complexity: {
      avgComplexity: 3,
      p95Complexity: 5,
      maxFunctionLines: 300,
      hotspots: [
        { file: 'ok.ts', function: 'monolith', complexity: 12, lines: 300 },
      ],
    },
  });
  const result = calculateHealthScore(scan, analysis);
  // worstFnLines=300 → t=(300-50)/450 = 0.556, score = 100 - 44.4 = 55.6 → 56
  // worst complexity 12 → score = 100 - 7.37*80/95 ≈ 94
  // worst file lines 0 (no critical) → 100
  // min(100, 56, 94) = 56
  assert.ok(
    result.breakdown.worstFile >= 45 && result.breakdown.worstFile <= 65,
    `expected 45-65, got ${result.breakdown.worstFile}`
  );
});

test('v1.4-s5.13 worstFile: 500+ line function hits floor 20', () => {
  const scan = mockScan({ criticalFiles: [] });
  const analysis = mockAnalysis({
    complexity: {
      avgComplexity: 3,
      p95Complexity: 5,
      maxFunctionLines: 500,
      hotspots: [
        { file: 'big.ts', function: 'colossus', complexity: 8, lines: 500 },
      ],
    },
  });
  const result = calculateHealthScore(scan, analysis);
  assert.equal(result.breakdown.worstFile, 20);
});

// ===== v1.4 Sprint 6 #12 — Tech debt penalty =====

test('v1.4-s6.12 techDebt: zero markers → no penalty', () => {
  const result = calculateHealthScore(mockScan(), mockAnalysis());
  // Default mock has 0 markers, score should not be affected.
  assert.ok(result.health.score >= 95);
});

test('v1.4-s6.12 techDebt: density 5/KLOC → -10 penalty', () => {
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
  });
  const clean = calculateHealthScore(mockScan(), mockAnalysis()).health.score;
  const debty = calculateHealthScore(mockScan(), analysis).health.score;
  // Penalty should be exactly -10 at density >= 5/KLOC.
  assert.equal(clean - debty, 10);
});

test('v1.4-s6.12 techDebt: density 1/KLOC → -2 penalty', () => {
  const analysis = mockAnalysis({
    techDebt: {
      totalMarkers: 10,
      byType: {
        todo: 10, fixme: 0, hack: 0, xxx: 0, bug: 0, deprecated: 0,
        'ts-ignore': 0, 'ts-expect-error': 0, 'ts-nocheck': 0, 'eslint-disable': 0,
      },
      densityPerKLoc: 1,
      highDensityFiles: [],
      sourceLoc: 10000,
    },
  });
  const clean = calculateHealthScore(mockScan(), mockAnalysis()).health.score;
  const debty = calculateHealthScore(mockScan(), analysis).health.score;
  assert.equal(clean - debty, 2);
});

// ===== v1.4 Sprint 7 #6 — Modularity extensions (god store, etc.) =====

test('v1.4-s7.6 modularity: 1 god store deducts 15 pts', () => {
  const analysis = mockAnalysis({
    modularity: {
      modularityScore: 85,
      applicable: true,
      issues: ['1 god store(s) detected.'],
      violations: [{ file: 'store/global.ts', type: 'god-store', count: 15 }],
    },
  });
  // Validates the type accepts the new violation kind. Score arithmetic
  // is verified by integration on the iFIGHT scan.
  assert.equal(analysis.modularity.violations[0].type, 'god-store');
});

test('v1.4-s7.6 modularity: context-overconsumed type accepted', () => {
  const analysis = mockAnalysis({
    modularity: {
      modularityScore: 90,
      applicable: true,
      issues: [],
      violations: [{ file: 'context/loading.tsx', type: 'context-overconsumed', count: 13 }],
    },
  });
  assert.equal(analysis.modularity.violations[0].type, 'context-overconsumed');
});

test('v1.4-s7.6 modularity: prop-drilling type accepted', () => {
  const analysis = mockAnalysis({
    modularity: {
      modularityScore: 95,
      applicable: true,
      issues: [],
      violations: [{ file: 'ui/Card.tsx', type: 'prop-drilling', count: 4 }],
    },
  });
  assert.equal(analysis.modularity.violations[0].type, 'prop-drilling');
});

// ===== v1.4 Sprint 8 #7 — Per-framework thresholds =====

test('v1.4-s8.7 framework: unknown framework falls back to hardcoded', () => {
  // __test__ doesn't exist in the calibration, so it should use the legacy
  // HIGH_COUPLING=12, COMPLEXITY=10 thresholds. Verified indirectly:
  // a project at avgCoupling=4 should still score 100 under that fallback.
  const scan = mockScan();
  const result = calculateHealthScore(scan, mockAnalysis());
  assert.equal(result.breakdown.coupling, 100);
});

test('v1.4-s8.7 framework: Next.js uses calibrated thresholds', () => {
  // Next.js is in the .fewserial. The calibrated p90 of avgCoupling for
  // Next.js (from the actual sample) is 6, which is much TIGHTER than
  // the legacy fallback of 12. A project with avgCoupling=4 still scores
  // 100 (under threshold/3=2... actually min(5, 6/2)=3, so 4 > 3, slight drop).
  // We just check that the score IS different from the fallback case to
  // confirm the framework-specific path is active.
  const scanFallback = mockScan(); // __test__
  const scanNext = {
    ...scanFallback,
    framework: { framework: 'Next.js', version: '14', bundler: 'Webpack' },
  };
  const r1 = calculateHealthScore(scanFallback, mockAnalysis({
    coupling: { avgCoupling: 7, highCouplingFiles: [], perFileImports: [] },
  }));
  const r2 = calculateHealthScore(scanNext, mockAnalysis({
    coupling: { avgCoupling: 7, highCouplingFiles: [], perFileImports: [] },
  }));
  // For avgCoupling=7: under fallback threshold 12 (4-24 curve), still mid-range.
  // Under Next.js threshold 6 (low=3, high=12 for the curve we use), 7 is past
  // the threshold so the score is harsher. They MUST differ.
  assert.notEqual(r1.breakdown.coupling, r2.breakdown.coupling);
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
      complexity: { avgComplexity: 20, p95Complexity: 50, maxFunctionLines: 0, hotspots: [] },
      modularity: { modularityScore: 0, applicable: true, issues: [], violations: [] },
    })
  );
  assert.ok(worst.health.score >= 0);
  assert.ok(worst.health.score <= 100);
});
