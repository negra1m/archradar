import chalk from 'chalk';
import { ScoreExplanation } from '../../types/index.js';

// v1.5 — `--explain` output.
//
// archradar's whole credibility rests on the score being auditable. The
// formula is published in SCORING.md, but a number a reader can't reproduce
// against THEIR OWN project is still authority theater. This report prints
// the exact arithmetic that produced the headline score: every component's
// value × weight = contribution, the calibration anchor it scored against,
// the flat penalties, the size ceiling, and the grade boundary it landed in.
//
// No enterprise scanner shows you this. It is the tool living up to the
// honesty it claims in its docs.

function rule(): void {
  console.log(chalk.dim('  ─────────────────────────────────────────────────────'));
}

function componentColor(value: number): (s: string) => string {
  return value >= 80 ? chalk.green : value >= 60 ? chalk.yellow : chalk.red;
}

export function explain(explanation: ScoreExplanation): void {
  const e = explanation;

  console.log('');
  rule();
  console.log(chalk.bold('  HOW THIS SCORE WAS COMPUTED'));
  rule();
  console.log('');
  console.log(
    chalk.dim('  Weighted average of components, minus flat penalties, capped by a') +
      '\n' +
      chalk.dim('  size ceiling. Every number below is reproducible from SCORING.md.')
  );
  console.log('');

  // Header row.
  console.log(
    '  ' +
      chalk.dim('component'.padEnd(16)) +
      chalk.dim('score'.padStart(6)) +
      chalk.dim('  weight'.padStart(9)) +
      chalk.dim('  = points'.padStart(11))
  );
  console.log(chalk.dim('  ' + '┄'.repeat(46)));

  for (const c of e.components) {
    const color = componentColor(c.value);
    const pct = `${Math.round((c.weight / e.totalWeight) * 100)}%`;
    console.log(
      '  ' +
        chalk.white(c.label.padEnd(16)) +
        color(String(c.value).padStart(6)) +
        chalk.dim(pct.padStart(9)) +
        chalk.cyan(c.contribution.toFixed(1).padStart(11))
    );
    if (c.anchor) {
      console.log('  ' + chalk.dim(`  ↳ anchored to ${c.anchor}`));
    }
  }

  console.log(chalk.dim('  ' + '┄'.repeat(46)));
  console.log(
    '  ' +
      chalk.white('weighted sum'.padEnd(16)) +
      ''.padStart(6) +
      ''.padStart(9) +
      chalk.bold.cyan(e.weightedSum.toFixed(1).padStart(11))
  );

  // Penalties.
  if (e.penalties.length > 0) {
    console.log('');
    for (const p of e.penalties) {
      console.log(
        '  ' +
          chalk.red(`− ${p.points}`.padEnd(6)) +
          chalk.white(p.label.padEnd(14)) +
          chalk.dim(p.reason)
      );
    }
    console.log(
      '  ' +
        chalk.white('after penalties'.padEnd(16)) +
        chalk.bold(String(e.afterPenalty).padStart(28))
    );
  } else {
    console.log('  ' + chalk.dim('no penalties applied (tech debt / data flow clean)'));
  }

  // Ceiling.
  console.log('');
  if (e.ceiling.applied) {
    console.log(
      '  ' +
        chalk.yellow('⚠ size ceiling') +
        chalk.dim(
          ` — ${e.ceiling.totalFiles} files cap the score at ${e.ceiling.value}. ` +
            `A small project can't earn the top grades.`
        )
    );
  } else {
    console.log(
      '  ' +
        chalk.dim(
          `size ceiling ${e.ceiling.value} (${e.ceiling.totalFiles} files) — not binding.`
        )
    );
  }

  // Final.
  console.log('');
  rule();
  console.log(
    '  ' +
      chalk.bold('FINAL  ') +
      chalk.bold.white(String(e.finalScore)) +
      chalk.dim('/100  ') +
      chalk.bold(`[${e.grade}]`)
  );
  rule();

  // Calibration provenance — fuses honesty (#2) with per-framework
  // calibration (#4) in one visible place.
  console.log('');
  if (e.calibration.source === 'community') {
    const conf = e.calibration.lowConfidence
      ? chalk.yellow(`low confidence (N=${e.calibration.sampleSize})`)
      : chalk.green(`N=${e.calibration.sampleSize}`);
    console.log(
      '  ' +
        chalk.dim(
          `Calibrated against real ${e.calibration.framework} OSS projects — `
        ) +
        conf
    );
  } else {
    console.log(
      '  ' +
        chalk.yellow('⚠ ') +
        chalk.dim(
          `No community calibration for "${e.calibration.framework}" — using generic ` +
            `fallback thresholds. Grades are less meaningful here.`
        )
    );
  }
  console.log('');
}
