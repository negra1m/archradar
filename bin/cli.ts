#!/usr/bin/env node

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import * as Scanner from '../src/core/scanner/index.js';
import * as Analyzer from '../src/core/analyzer/index.js';
import * as ScoreEngine from '../src/core/scoring/index.js';
import * as Reporter from '../src/core/report/index.js';
import { encodeScan, decodeResponse } from '../src/utils/fewserial.js';

const ARCHRADAR_API = process.env.ARCHRADAR_API_URL ?? 'https://api.archradar.fewcompany.com';

async function sendToApi(token: string, payload: string): Promise<void> {
  try {
    const res = await fetch(`${ARCHRADAR_API}/scan/premium`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-fewserial',
      },
      body: payload,
    });

    if (!res.ok) return;

    const raw = await res.text();
    const data = decodeResponse(raw);

    console.log('');
    console.log(chalk.dim('  ─────────────────────────────────────────'));
    console.log(chalk.bold('  PREMIUM INSIGHTS'));
    console.log(chalk.dim('  ─────────────────────────────────────────'));

    if (data.prevScore > 0) {
      const sign = data.delta >= 0 ? '+' : '';
      const color = data.delta > 0 ? chalk.green : data.delta < 0 ? chalk.red : chalk.yellow;
      console.log(`  Trend: ${color(`${sign}${data.delta}`)} (${data.prevScore} → ${data.currentScore})`);
    }

    for (const insight of data.insights) {
      console.log(`  ${chalk.cyan('›')} ${insight}`);
    }

    console.log(chalk.dim('  ─────────────────────────────────────────'));
  } catch {
    // silently skip — premium is non-blocking
  }
}

const program = new Command();

program
  .name('archradar')
  .description('Architectural Intelligence Engine for modern frontend teams — by Few Company')
  .version('1.1.1');

program
  .command('scan [projectPath]')
  .description('Analyze the architectural health of a frontend project')
  .option('--token <jwt>', 'Premium token for historical tracking and insights')
  .option('--json', 'Output results as JSON')
  .action(async (projectPath?: string, opts?: { token?: string; json?: boolean }) => {
    const targetPath = path.resolve(projectPath ?? '.');
    const token = opts?.token ?? process.env.ARCHRADAR_TOKEN;
    const spinner = ora('Scanning project...').start();

    try {
      spinner.text = 'Scanning files and dependencies...';
      const scanResult = await Scanner.run(targetPath);

      spinner.text = 'Running AST analysis...';
      const analysisResult = await Analyzer.run(targetPath);

      spinner.text = 'Calculating architectural score...';
      const scoreResult = ScoreEngine.run(scanResult, analysisResult);

      spinner.succeed('Analysis complete');

      if (opts?.json) {
        console.log(JSON.stringify({ scan: scanResult, analysis: analysisResult, score: scoreResult }, null, 2));
        return;
      }

      Reporter.display(scanResult, analysisResult, scoreResult);

      if (token) {
        const payload = encodeScan({
          framework: scanResult.framework.framework,
          version: scanResult.framework.version,
          totalFiles: scanResult.files.totalFiles,
          avgLines: scanResult.files.avgLinesPerFile,
          healthScore: scoreResult.health.score,
          grade: scoreResult.health.grade,
          riskLevel: scoreResult.risk.riskLevel,
          avgCoupling: analysisResult.coupling.avgCoupling,
          avgComplexity: analysisResult.complexity.avgComplexity,
          circularDeps: analysisResult.circularDeps.cycles.length,
          criticalFiles: scanResult.files.criticalFiles.length,
          hotspots: analysisResult.complexity.hotspots.map((h) => ({
            file: h.file,
            fn: h.function,
            score: h.complexity,
          })),
        });
        await sendToApi(token, payload);
      }
    } catch (err: unknown) {
      spinner.fail('Analysis failed');
      if (err instanceof Error) {
        console.error(err.message);
      }
      process.exit(1);
    }
  });

program.parse(process.argv);

// default: run scan on cwd if no command given
if (process.argv.length === 2) {
  program.parse(['node', 'archradar', 'scan']);
}
