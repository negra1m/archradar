import chalk from 'chalk';
import path from 'path';
import { ScanResult, AnalysisResult, ScoreResult } from '../../types/index.js';
import { maskPath } from '../../utils/pathMask.js';
import { textToBraille, applyGradient } from '../welcome/brailleText.js';
import { HIGH_COUPLING_THRESHOLD } from '../analyzer/couplingAnalyzer.js';

export interface PremiumInsights {
  prevScore: number;
  currentScore: number;
  delta: number;
  trend: 'up' | 'down' | 'stable';
  insights: string[];
}

export interface AuthedUser {
  username: string;
  email: string | null;
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

function gradeColor(grade: string): string {
  const map: Record<string, (s: string) => string> = {
    A: chalk.green,
    B: chalk.cyan,
    C: chalk.yellow,
    D: chalk.red,
    F: chalk.bgRed.white,
  };
  return (map[grade] ?? chalk.white)(grade);
}

export function display(
  scan: ScanResult,
  analysis: AnalysisResult,
  score: ScoreResult,
  premium?: PremiumInsights,
  user?: AuthedUser
): void {
  const projectName = path.basename(scan.projectPath);

  // Braille dot-matrix header — same style as welcome but discreet (no
  // tip box, no animation, no jellyfish).
  const braille = textToBraille('ARCHRADAR');
  console.log('');
  console.log(applyGradient(braille, '#00d4ff', '#ff00ff'));
  console.log(chalk.dim('  Architectural Intelligence Engine — by Few Company'));

  // Project info
  console.log('');
  console.log(`  ${chalk.dim('Project:')}   ${chalk.white.bold(projectName)}`);
  console.log(
    `  ${chalk.dim('Framework:')} ${chalk.white(scan.framework.framework)}${scan.framework.version ? chalk.dim(' ' + scan.framework.version) : ''}`
  );
  console.log(`  ${chalk.dim('Bundler:')}   ${chalk.white(scan.framework.bundler)}`);
  console.log(`  ${chalk.dim('Files:')}     ${chalk.white(scan.files.totalFiles.toString())}`);
  console.log(`  ${chalk.dim('Avg lines:')} ${chalk.white(scan.files.avgLinesPerFile.toString())}`);
  console.log(`  ${chalk.dim('Total deps:')}${chalk.white(' ' + scan.dependencies.totalDeps.toString())}`);

  // Score
  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log(chalk.bold('  ARCHITECTURAL HEALTH SCORE'));
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log('');
  console.log(`  ${scoreBar(score.health.score)}  ${chalk.bold.white(String(score.health.score))}${chalk.dim('/100')}  [${gradeColor(score.health.grade)}]`);

  // Score breakdown
  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log(chalk.bold('  BREAKDOWN'));
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log('');
  const b = score.breakdown;
  printBreakdownLine('File size', b.fileSize);
  printBreakdownLine('Critical files', b.criticalFiles);
  printBreakdownLine('Structure', b.structure);
  printBreakdownLine('Dependencies', b.dependencies);
  printBreakdownLine('Coupling', b.coupling);
  printBreakdownLine('Complexity', b.complexity);
  printBreakdownLine('Modularity', b.modularity);

  // Findings
  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log(chalk.bold('  FINDINGS'));
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log('');

  if (scan.files.criticalFiles.length > 0) {
    console.log(`  ${chalk.yellow('⚠')}  ${scan.files.criticalFiles.length} critical file(s) (>300 lines)`);
    scan.files.criticalFiles.slice(0, 3).forEach((f) => {
      console.log(`     ${chalk.dim('→')} ${chalk.red(maskPath(f.path))} ${chalk.dim(`(${f.lines} lines)`)}`);
    });
  } else {
    console.log(`  ${chalk.green('✓')}  No critical files detected`);
  }

  if (scan.dependencies.suspiciousDeps.length > 0) {
    scan.dependencies.suspiciousDeps.forEach((s) => {
      console.log(`  ${chalk.yellow('⚠')}  ${s}`);
    });
  } else {
    console.log(`  ${chalk.green('✓')}  No overlapping dependencies`);
  }

  if (scan.dependencies.heavyDeps.length > 0) {
    console.log(`  ${chalk.yellow('⚠')}  Heavy deps: ${chalk.red(scan.dependencies.heavyDeps.join(', '))}`);
  }

  if (scan.structure.hasRecognizedPattern) {
    console.log(`  ${chalk.green('✓')}  Recognized structure: ${chalk.cyan(scan.structure.patternName)}`);
  } else {
    console.log(`  ${chalk.yellow('⚠')}  No recognizable folder structure`);
  }

  // AST findings
  if (analysis.complexity.hotspots.length > 0) {
    const worst = analysis.complexity.hotspots[0];
    console.log(`  ${chalk.yellow('⚠')}  High complexity: ${chalk.red(worst.function)} (score ${worst.complexity}) in ${chalk.dim(maskPath(worst.file))}`);
  } else {
    console.log(`  ${chalk.green('✓')}  Cyclomatic complexity within threshold`);
  }

  if (analysis.circularDeps.hasCycles) {
    const total = analysis.circularDeps.allCycles.length;
    const shown = Math.min(2, total);
    const suffix = total > 2 ? chalk.dim(` (showing top ${shown})`) : '';
    console.log(`  ${chalk.red('✗')}  ${total} circular dep(s) detected${suffix}`);
    analysis.circularDeps.cycles.slice(0, 2).forEach((cycle) => {
      console.log(`     ${chalk.dim('→')} ${chalk.red(cycle.map(maskPath).join(' → '))}`);
    });
  } else {
    console.log(`  ${chalk.green('✓')}  No circular dependencies`);
  }

  if (analysis.coupling.highCouplingFiles.length > 0) {
    console.log(`  ${chalk.yellow('⚠')}  ${analysis.coupling.highCouplingFiles.length} file(s) with high coupling (>=${HIGH_COUPLING_THRESHOLD} imports)`);
  }

  if (analysis.modularity.issues.length > 0) {
    analysis.modularity.issues.forEach((issue) => {
      console.log(`  ${chalk.yellow('⚠')}  ${issue}`);
    });
  }

  // Recommendations
  if (score.recommendations.length > 0) {
    console.log('');
    console.log(chalk.dim('  ─────────────────────────────────────────'));
    console.log(chalk.bold('  RECOMMENDATIONS'));
    console.log(chalk.dim('  ─────────────────────────────────────────'));
    console.log('');
    score.recommendations.forEach((rec, i) => {
      console.log(`  ${chalk.cyan(`${i + 1}.`)} ${rec}`);
    });
  }

  // Premium insights (from archradar-api, only for authed users)
  if (premium && premium.insights.length > 0) {
    console.log('');
    console.log(chalk.dim('  ─────────────────────────────────────────'));
    console.log(chalk.bold.magenta('  PREMIUM INSIGHTS'));
    console.log(chalk.dim('  ─────────────────────────────────────────'));
    console.log('');

    premium.insights.forEach((insight) => {
      console.log(`  ${chalk.magenta('›')} ${insight}`);
    });
  }

  // Status banner — signed-in or unlock-prompt
  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  if (user && user.username) {
    console.log(`  ${chalk.green('✓')} ${chalk.bold.white('PREMIUM UNLOCKED')}`);
    console.log(`    ${chalk.dim('Signed in as')} ${chalk.cyan('@' + user.username)}`);
    console.log(`    ${chalk.dim('Free during early access.')}`);
  } else {
    console.log(`  ${chalk.yellow('◆')} ${chalk.bold.white('FREE DURING EARLY ACCESS')}`);
    console.log(`    ${chalk.dim('Sign in with GitHub to unlock deep analysis:')}`);
    console.log(`    ${chalk.cyan('archradar login')}`);
  }
  console.log(chalk.dim('  ─────────────────────────────────────────'));

  // Footer
  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log(`  ${chalk.dim('Deep analysis:')} ${chalk.cyan('fewcompany.com')}`);
  console.log(chalk.dim('  ─────────────────────────────────────────'));
  console.log('');
}

function printBreakdownLine(label: string, value: number | null): void {
  if (value === null) {
    console.log(
      `  ${chalk.dim(label.padEnd(16))} ${chalk.dim('─'.repeat(10))} ${chalk.dim('N/A')}`
    );
    return;
  }
  const color = value >= 80 ? chalk.green : value >= 60 ? chalk.yellow : chalk.red;
  const bar = '█'.repeat(Math.round(value / 10));
  console.log(`  ${chalk.dim(label.padEnd(16))} ${color(bar.padEnd(10))} ${color(String(value))}`);
}
