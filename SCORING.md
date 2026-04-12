# archradar — Scoring Reference

This document is the canonical reference for how archradar computes the **Architectural Health Score**. It exists because a score that isn't explained is just a number with a logo on it.

> Companion doc: [`DESIGN.md`](./DESIGN.md) explains what archradar **does not** measure. Read that first if you're evaluating the tool.

---

## Semver contract

Starting with **v1.4.0**, the scoring formula is part of archradar's public contract. It obeys semver:

- **Major bump** (`1.x.x` → `2.0.0`): breaking change to component weights, curves, grade thresholds, calibration source, or any change that shifts scores on typical projects by **>5 points**.
- **Minor bump** (`1.4.0` → `1.5.0`): new components added with weight redistribution, new detectors, new framework profiles. Small score drift expected (<5 pts) due to renormalization.
- **Patch bump** (`1.4.0` → `1.4.1`): bug fixes, off-by-one corrections, markdown template tweaks. Should not meaningfully change scores on any given project.

Pin `@fewcompany/archradar@~1.4.0` and expect stable behavior until you opt in to a new minor. Every score-affecting change is logged below with date, reason, and the delta it caused on the iFIGHT reference project.

---

## Components and weights (v1.4.0)

The final score is a weighted average of 7 mandatory components and 2 nullable components. Null-weight is redistributed proportionally across the rest.

| Component | Weight | What it measures |
|---|---|---|
| File size | 10% | Average lines per source file. Linear decay from ≤80 lines (100pts) to ≥500 lines (20pts). |
| Critical files | 15% | Ratio of source files >300 lines. Linear decay from 0% (100pts) to 30% (20pts). |
| Structure | 5% | Recognized framework pattern + folder count. Near-free point for modern apps — intentionally low weight. |
| Dependencies | 10% | Overlapping dep groups and heavy runtime deps. Capped penalty so 5 and 50 suspicious deps don't score the same. |
| Coupling | 15% | Avg imports per file. Threshold is per-framework (p90 of real OSS) from `calibration.fewserial`. |
| Complexity | 20% | Cognitive complexity (SonarSource spec). 40% avg + 60% p95 blend + hotspot-density asymptotic penalty. |
| Worst file | 10% | **Dedicated penalty for the single worst outlier** — kills averaging dilution. Takes the worst of: longest file, longest function, most complex function. |
| Modularity | 10% (nullable) | UI/hook dependency inversion + god stores + over-consumed contexts + prop drilling. Null for backend-only projects. |
| Tests | 10% (nullable) | Proxy (test files / source files). NOT real coverage. Null for projects with <20 source files. |

Total is 105% when all components apply; the weighted sum is normalized by the sum of actual weights, so nothing inflates.

**Size ceiling**: on top of the weighted sum, the score is capped by `60 + 40·min(1, log10(totalFiles)/2)` — a smooth curve from 60 (1 file) to 100 (100+ files). Tiny projects can't earn the top grades.

**Tech debt penalty**: applied as a flat deduction (up to −10pts) based on markers-per-KLOC density (`// TODO`, `@ts-ignore`, `eslint-disable`, etc.). Not a weighted component — it's a signal, not a dimension.

---

## Curves (concrete formulas)

### File size
```
≤ 80 lines  → 100
≥ 500 lines → 20
linear     → 100 - (avgLines - 80)/(500-80) * 80
```

### Critical files
```
ratio = criticalCount / totalFiles (capped at 0.3)
score = 100 - (ratio / 0.3) * 80
```

### Coupling (per-framework)
```
threshold = framework p90 from calibration.fewserial (or 12 fallback)
low  = threshold / 3
high = threshold * 2
≤ low  → 100
≥ high → 20
linear → 100 - (avg - low)/(high - low) * 80
```

### Complexity (cognitive, per-framework)
```
threshold = framework p90 of p95Complexity (or 10 fallback)
avgScore = curve(avgCognitive, threshold)
p95Score = curve(p95Cognitive, threshold)
blended  = avgScore * 0.4 + p95Score * 0.6
penalty  = 40 * (1 - exp(-hotspotsCount / 8))
final    = max(0, blended - penalty)

where curve(v, t):
  ≤ max(5, t/2) → 100
  t             → 60
  t*3           → 20
  linear interpolation between anchors
```

### Worst file
```
worstFileLines  = max line count across critical files
worstFnLines    = max line count across hotspot functions
worstComplexity = max cognitive across hotspot functions

fileLinesScore = curve(200 → 100, 1500 → 20)
fnLinesScore   = curve(50  → 100, 500  → 20)
complexityScore = curve(5  → 100, 100  → 20)

result = min(fileLinesScore, fnLinesScore, complexityScore)
```

### Tests (proxy)
```
ratio = testFileCount / sourceFileCount
< 20 source files → null (redistributed)
ratio 0           → 20
ratio 0.1         → 40
ratio 0.3         → 80
ratio >= 0.5      → 100
linear between anchors
```

### Tech debt penalty
```
density = markers per 1000 source lines
0/KLOC  → 0 penalty
1/KLOC  → -2
3/KLOC  → -6
5+/KLOC → -10 (cap)
```

### Size ceiling
```
ceiling = round(60 + 40 * min(1, log10(max(1, totalFiles)) / 2))
final_score = min(raw_score, ceiling)
```

---

## Grade thresholds

v1.4 grades come from the **quantile distribution of real OSS projects** in the calibration sample, not from arbitrary cutoffs.

For each framework:
- **A** = top 10% of calibrated projects for that framework (framework p90 of healthScore)
- **B** = top 50% (p50 / median)
- **C** = top 75% (p25)
- **D** = top 90% (p10)
- **F** = bottom 10%

**"A" is rare by design.** It means "your project scores higher than 90% of real OSS projects in the same framework by archradar's metric." Not "80+".

Framework thresholds from the v1.4.0 calibration (99 samples across 4 frameworks):

| Framework | A | B | C | D |
|---|---|---|---|---|
| Next.js | 84 | 60 | 59 | 54 |
| React | 71 | 62 | 56 | 50 |
| Vue | 79 | 63 | 60 | 55 |
| Angular | 81 | 68 | 62 | 56 |

When no calibration data exists for the framework, the CLI falls back to hardcoded v1.3 boundaries (A≥85, B≥70, C≥55, D≥40, F<40).

---

## Calibration

The per-framework thresholds and grade boundaries live in `src/data/calibration.fewserial`. The file is generated by `archradar-api/scripts/calibrate.ts`, which:

1. Clones a curated list of OSS projects per framework (`scripts/calibration-repos.json`)
2. Runs `archradar scan --json` against each
3. Aggregates p50/p90/p99 per metric per framework
4. Derives grade thresholds from the healthScore distribution

**v1.4.0 calibration**: 99 samples, 100 repos targeted, 1 scan failure (`nebular` — excluded).

The sample size is small. p99 estimates are jittery. **DESIGN.md documents this honestly** — we don't pretend N=99 is a statistical population.

---

## Changelog

### v1.4.0 — 2026-04-12 — "Not a toy"

**Breaking changes** to scoring (major bump):
- Cyclomatic complexity replaced by **cognitive complexity** (SonarSource spec). Function scores are typically 1.3-1.6× higher; threshold shifted accordingly.
- Weights rebalanced: structure 15%→5%, deps 15%→10%, fileSize 15%→10%, complexity 15%→20%. Two new components: worstFile (+10%), tests (+10% nullable).
- Size ceiling is now a continuous log curve instead of 4 discrete steps.
- Hotspot penalty is asymptotic instead of hard-capped at −40.
- Grade thresholds come from per-framework quantiles, not hardcoded 85/70/55/40.
- Per-framework coupling and complexity thresholds derived from calibration p90.
- Type-only imports (`import type`) excluded from circular dep detection.
- Worst-file penalty added as a dedicated component to mitigate averaging dilution.

**New components:**
- Test coverage proxy (structural — file count ratio, not real LCOV).
- Tech debt markers (TODO/FIXME/HACK/@ts-ignore density, flat penalty).
- Modularity extensions: god stores (>10 exports in store-like files), over-consumed contexts (>5 consumers), prop drilling suspects.

**Calibration refresh:** 99 OSS samples across Next.js, React, Vue, Angular. Median healthScore dropped ~15-17 pts from v1.3 across all frameworks. That's the math working — v1.3 was inflating scores by about that much.

**iFIGHT reference delta**: `81 [B]` (v1.3) → `64 [B]` (v1.4), where v1.4's "B" means "above median Next.js" not "traditional 85+".

**Docs:** `DESIGN.md` declares what archradar doesn't measure. `SCORING.md` (this file) is the canonical formula reference.

### v1.3.0 — 2026-04-11 — "Honest math"

First pass at mathematical rigor:
- Continuous curves replaced cliffs in fileSize, criticalFiles, coupling.
- p95Complexity computed (but not yet wired into score — that was v1.4).
- Bootstrap calibration.json with disclaimer.
- Risk Level feature removed (redundant with grade).

### v1.1.0 — 2026-03-XX — First public release

Initial npm publish. Basic scoring with arbitrary thresholds.

---

## Known limitations (roadmap)

See `DESIGN.md` for the full list. The scoring-specific limitations:

- **Small calibration sample.** N=99 across 4 frameworks. Growing to N≥50/framework is planned.
- **Grade thresholds depend on calibration quality.** Bad calibration → misleading grades. Community contributions to the repo pool are welcome.
- **Averages still dilute some signal** even with worstFile. A project with 5 catastrophic files still averages worse than a project with 1 — but the worstFile component only catches the SINGLE worst. A "clusterWorst" component is on the roadmap for v1.5.
- **Cognitive complexity is a heuristic**, not a proof of readability. A function with score 5 can still be unreadable if it uses single-letter variable names and no comments.
- **Test coverage is a proxy.** A project with 30 test files that all `assert(true)` gets the same score as one with 30 real tests. Real coverage integration is planned for v1.5.
- **Bundle size analysis depends on BundlePhobia.** The public API rate-limits aggressively, and large dependency lists can hit 429s. When that happens, the audit report's bundle section is empty — *not* a sign that your bundles are fine. A self-hosted cache proxy is on the v1.5 roadmap.

---

*v1.4.0 — Few Company — AGPL-3.0*
