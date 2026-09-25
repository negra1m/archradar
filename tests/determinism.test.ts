/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * v1.5 — Determinism tests.
 *
 * The local history feature is only credible if the same unchanged project
 * produces the SAME result every run. Non-determinism (random pivots, glob /
 * readdir ordering, OS path separators leaking into output) would surface fake
 * deltas. These tests run the full pipeline twice on an identical fixture and
 * assert byte-identical output, plus unit-level checks on the primitives that
 * were the known offenders.
 *
 * Run after build:
 *   node --test dist-tests/tests/determinism.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as Scanner from '../src/core/scanner/index.js';
import * as Analyzer from '../src/core/analyzer/index.js';
import * as ScoreEngine from '../src/core/scoring/index.js';
import { topK } from '../src/utils/topK.js';

// Build a fixture with: a circular dependency, several high-complexity
// functions with TIED complexity (the worst case for ordering stability), and
// enough files to exercise the top-K paths.
function buildFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archradar-det-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: { react: '^18.0.0', next: '^14.0.0' } })
  );
  const src = path.join(dir, 'src');
  fs.mkdirSync(src);

  // Circular dependency: a -> b -> c -> a.
  fs.writeFileSync(path.join(src, 'a.ts'), `import { b } from './b';\nexport const a = () => b();\n`);
  fs.writeFileSync(path.join(src, 'b.ts'), `import { c } from './c';\nexport const b = () => c();\n`);
  fs.writeFileSync(path.join(src, 'c.ts'), `import { a } from './a';\nexport const c = () => a();\n`);

  // Several functions with IDENTICAL cognitive complexity, in files whose glob
  // order is not obviously their sort order. Ties must break deterministically.
  const nested = (n: number) => `
export function complex${n}(x: number) {
  if (x > 0) {
    if (x > 1) {
      if (x > 2) {
        for (let i = 0; i < x; i++) {
          if (i % 2 === 0) { console.log(i); }
        }
      }
    }
  }
  return x;
}
`;
  for (const name of ['zeta', 'alpha', 'mike', 'bravo', 'november']) {
    fs.writeFileSync(path.join(src, `${name}.ts`), nested(1));
  }

  // Pad with simple files so the project clears size thresholds.
  for (let i = 0; i < 25; i++) {
    fs.writeFileSync(path.join(src, `pad${i}.ts`), `export const v${i} = ${i};\n`);
  }
  return dir;
}

async function runPipeline(dir: string) {
  const scan = await Scanner.run(dir);
  const analysis = await Analyzer.run(dir);
  const score = ScoreEngine.run(scan, analysis);
  return { scan, analysis, score };
}

test('determinism: full pipeline is byte-identical across two runs', async () => {
  const dir = buildFixture();
  try {
    const r1 = await runPipeline(dir);
    const r2 = await runPipeline(dir);
    // Serialize both and compare. Any ordering instability (hotspots, cycles,
    // graph keys, coupling list) would produce a diff here.
    assert.equal(JSON.stringify(r1), JSON.stringify(r2), 'two runs of an unchanged project must be identical');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('determinism: emitted paths use POSIX separators (no backslashes)', async () => {
  const dir = buildFixture();
  try {
    const { analysis } = await runPipeline(dir);
    const serialized = JSON.stringify(analysis);
    // No Windows-style separators should appear anywhere in the analysis output.
    assert.ok(!/[A-Za-z0-9]\\\\[A-Za-z0-9]/.test(serialized), 'analysis output must not contain backslash path separators');
    // The cycle must be present and canonical (starts at the smallest node).
    assert.ok(analysis.circularDeps.hasCycles, 'fixture has an a→b→c→a cycle');
    const cyc = analysis.circularDeps.allCycles[0];
    assert.equal(cyc[0], cyc[cyc.length - 1], 'cycle is a closed loop');
    // Smallest node in {a,b,c} is "src/a.ts" — canonical start.
    assert.ok(cyc[0].endsWith('a.ts'), `canonical cycle should start at a.ts, got ${cyc[0]}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ===== topK primitive =====

test('topK: deterministic across repeated calls (no random pivot)', () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ id: i, v: i % 7 }));
  const a = topK(items, 5, (x) => x.v, (p, q) => p.id - q.id);
  const b = topK(items, 5, (x) => x.v, (p, q) => p.id - q.id);
  assert.deepEqual(a, b, 'topK must return the same K in the same order every call');
});

test('topK: total order with tiebreak resolves equal keys stably', () => {
  // All keys equal — order must come entirely from the tiebreak.
  const items = [{ n: 'c' }, { n: 'a' }, { n: 'b' }, { n: 'e' }, { n: 'd' }];
  const top3 = topK(items, 3, () => 1, (p, q) => p.n.localeCompare(q.n));
  assert.deepEqual(top3.map((x) => x.n), ['a', 'b', 'c'], 'ties broken by comparator, ascending');
});

test('topK: picks the K highest by key, ties broken deterministically', () => {
  const items = [
    { id: 1, v: 10 }, { id: 2, v: 10 }, { id: 3, v: 5 },
    { id: 4, v: 20 }, { id: 5, v: 20 },
  ];
  const top3 = topK(items, 3, (x) => x.v, (p, q) => p.id - q.id);
  // Highest are the two 20s (ids 4,5) then a 10 (lowest id among 10s = 1).
  assert.deepEqual(top3.map((x) => x.id), [4, 5, 1]);
});

test('topK: returns all (finalized) when array smaller than k', () => {
  const items = [{ id: 3, v: 1 }, { id: 1, v: 1 }, { id: 2, v: 1 }];
  const out = topK(items, 10, (x) => x.v, (p, q) => p.id - q.id);
  assert.deepEqual(out.map((x) => x.id), [1, 2, 3], 'small arrays are still ordered by the tiebreak');
});
