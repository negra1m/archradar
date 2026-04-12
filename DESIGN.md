# archradar — Design & Limitations

> This document declares **what archradar measures**, **how it measures**, and **what it explicitly does not measure**. If you are evaluating archradar for a real project, read this first.

archradar is a **static architectural scanner** for frontend codebases. It parses source files using the TypeScript AST (via [ts-morph](https://ts-morph.com/)) and produces a health score in the range `0–100` with a grade `A–F`. The score is computed entirely offline from source structure — no runtime tracing, no coverage instrumentation, no bundle profiling.

This document exists because **a score alone is not credible** unless the tool is honest about what it can and cannot see.

---

## What archradar measures

| Dimension | How |
|---|---|
| **File size** | Line count per file, average across project, fraction of files exceeding 300 lines (critical files). |
| **Function complexity** | Cyclomatic complexity (v1.3) / cognitive complexity (v1.4+). Computed per function; reported as avg, p95, and top-10 hotspots. |
| **Module coupling** | Number of local `import` declarations per file. Per-file distribution + average. Type-only imports (`import type`) are filtered since they disappear at compile time. |
| **Circular dependencies** | DFS cycle detection on the local-import graph. Reports all cycles, not just top-N. |
| **Modularity** | Path-based rules: UI files importing logic modules directly, hooks importing UI components, god-stores with >10 exports, over-consumed contexts (v1.4+). |
| **Dependency hygiene** | Overlapping dependency groups (e.g., `moment + dayjs + date-fns`), heavy runtime deps, pre-1.0 outdated libraries. |
| **Tech debt markers (v1.4+)** | Density of `// TODO`, `// FIXME`, `// HACK`, `@ts-ignore`, `eslint-disable` across source files. |
| **Test coverage proxy (v1.4+)** | Ratio of `*.test.*` / `*.spec.*` / `__tests__/` files to source files. **This is a proxy for test culture, not real coverage** (see below). |
| **Data flow basics (v1.4+)** | Heuristic detection of shared mutable state, deep prop drilling, import-time side effects. Not a full static analyzer. |

---

## What archradar does **not** measure

| Dimension | Why not | Planned? |
|---|---|---|
| **Runtime correctness / behavior** | We never execute your code. Tests aren't run, components aren't rendered. | Out of scope. |
| **Real test coverage (lines/branches)** | Would require executing jest/vitest and parsing LCOV. archradar stays offline. We only measure the *presence* of test files as a proxy for test culture. | v1.5 — optional LCOV integration. |
| **Accessibility (a11y)** | Needs DOM rendering and axe-style checks. | Out of scope. |
| **Runtime performance** | Needs profiling, bundle parsing at runtime. | Out of scope. |
| **Security vulnerabilities** | `npm audit` / Snyk / OSV handle this far better than we could. | Out of scope — use them. |
| **Semantic duplication** | AST-hash block comparison (jscpd-style) is on the roadmap. v1.3–v1.4 do not detect duplicated logic across files. | v1.5. |
| **Full data flow analysis** | Rigorous inter-procedural data flow requires a program analysis framework (Flow, Infer). Our v1.4 data flow detector catches shared mutable state and deep prop drilling heuristically — it **cannot prove safety**. | For rigorous analysis, use `@typescript-eslint` with dedicated rules or a formal static analyzer. |
| **Real bundle size** | v1.4 integrates BundlePhobia for transitive size on premium audits. v1.3 looks at `package.json` only. | v1.4+ premium. |
| **Tracking by contributor / PR-level regression** | Requires Git integration and PR comment bot. | v1.4+. |

---

## How the score is computed

archradar computes **six-to-eight component scores** (depending on project type), each in `0–100`, then combines them into a weighted average. Weights are documented in [`SCORING.md`](./SCORING.md) (published with v1.4).

**Key honesty caveats:**

1. **The score is an average.** A project can score 81 while containing a single catastrophic file — the average dilutes the outlier. v1.4 introduces a dedicated "worst file" penalty to mitigate this, but averaging is fundamental to how static analysis scores work. **Always read the "Cross-correlated bottlenecks" section of the audit, not just the headline score.**

2. **The realistic range is 40–100, not 0–100.** A project with a recognized framework (Next.js, React, Vue, Angular) and reasonable dependency hygiene will never score below ~40 on our formula, because structure and dependency components are near-free points for any modern app. Grade `F` means "severe and systemic", not "50% broken".

3. **Grade thresholds are calibrated from real OSS repos.** v1.4 replaces arbitrary thresholds (A ≥ 85) with quantile-based thresholds derived from ~200 OSS projects per framework. `A` corresponds to the top 10% of calibrated projects for that specific framework — so `A` is rare by design.

4. **The calibration sample is documented and disclosed.**
   - v1.3: 99 OSS repos total (~25 per framework). p99 estimates are noisy at this sample size.
   - v1.4: 200+ OSS repos (~50 per framework). More stable but still not a statistical population.
   - Pre-1.0 (bootstrap): the sample was heuristic estimates; marked `"bootstrap"` in audit reports with a low-confidence disclaimer.

5. **Thresholds are framework-specific (v1.4+).** A Next.js page that imports 15 components is often fine; a React hook that imports 15 things is usually wrong. v1.3 used a single `HIGH_COUPLING = 12` for everything. v1.4 derives per-framework thresholds from the p90 of real OSS repos in that framework.

---

## Semver contract for scoring

Starting in v1.4.0, archradar's scoring formula is part of the **public API** and follows semver:

- **Major bump** (`1.x.x` → `2.0.0`): breaking change to weights, curves, grade thresholds, or calibration source.
- **Minor bump** (`1.4.0` → `1.5.0`): new components added (weight redistributed), new detectors, new insights. Old scores may shift slightly due to renormalization.
- **Patch bump** (`1.4.0` → `1.4.1`): bug fixes, off-by-one corrections, markdown template fixes. Should not meaningfully change scores on any given project.

You can pin `@fewcompany/archradar@~1.4.0` and expect stable behavior until you opt in to a new minor.

Every score-affecting change is logged in [`SCORING.md`](./SCORING.md) with the date, reason, and before/after deltas on the iFIGHT reference project.

---

## Why trust the numbers at all, then?

archradar is honest about being **one signal among many**, not a replacement for code review. What it gives you:

- **Consistency**: the same codebase scored yesterday vs. today tells you whether you improved or regressed, assuming you pin the version.
- **Cross-project comparability**: within the same framework, two archradar scores are directly comparable. Across frameworks, the quantile-based grades make grades comparable even if raw scores are not.
- **Surfacing**: archradar doesn't tell you "the signup flow is broken" — but it will tell you "signup/page.tsx has complexity 122 and 15 imports and appears in three risk lists", which is usually enough to make a human reviewer look at the right place.
- **Honesty**: when a metric is weak (small calibration sample, heuristic detector, proxy measurement), the audit report says so. No authority theater.

If you want **more** than what archradar measures, use archradar alongside:
- `@typescript-eslint` for lint-level quality
- `jest --coverage` / `vitest --coverage` for real test coverage
- `axe-core` / `eslint-plugin-jsx-a11y` for accessibility
- BundlePhobia / Webpack Bundle Analyzer for runtime bundle impact
- Snyk / `npm audit` / OSV for security
- Code review by an experienced human — the one thing no scanner replaces

---

## Questions, bug reports, or "your score is wrong about my project"

Open an issue at [negra1m/archradar](https://github.com/negra1m/archradar/issues). If you believe the score is misrepresenting your project, include a public link or a reproducible snippet — we will either fix the detector or document the limitation here. Both outcomes strengthen the tool.

---

**v1.4.0 — Few Company — AGPL-3.0**
