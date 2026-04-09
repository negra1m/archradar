#!/usr/bin/env node

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import * as Scanner from '../src/core/scanner/index.js';
import * as Analyzer from '../src/core/analyzer/index.js';
import * as ScoreEngine from '../src/core/scoring/index.js';
import * as Reporter from '../src/core/report/index.js';

const program = new Command();

program
  .name('archradar')
  .description('Architectural Intelligence Engine for modern frontend teams — by Few Company')
  .version('0.1.0');

program
  .command('scan [projectPath]')
  .description('Analyze the architectural health of a frontend project')
  .action(async (projectPath?: string) => {
    const targetPath = path.resolve(projectPath ?? '.');
    const spinner = ora('Scanning project...').start();

    try {
      spinner.text = 'Scanning files and dependencies...';
      const scanResult = await Scanner.run(targetPath);

      spinner.text = 'Running AST analysis...';
      const analysisResult = await Analyzer.run(targetPath);

      spinner.text = 'Calculating architectural score...';
      const scoreResult = ScoreEngine.run(scanResult, analysisResult);

      spinner.succeed('Analysis complete');

      Reporter.display(scanResult, analysisResult, scoreResult);
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
