#!/usr/bin/env node

import { Command } from 'commander';
import { Listr } from 'listr2';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import * as Scanner from '../src/core/scanner/index.js';
import * as Analyzer from '../src/core/analyzer/index.js';
import * as ScoreEngine from '../src/core/scoring/index.js';
import * as Reporter from '../src/core/report/index.js';
import { runAudit } from '../src/core/analyzer/auditAnalyzer.js';
import { generateMarkdownReport, AuditApiResponse } from '../src/core/audit/markdownReport.js';
import { ensureGitignore } from '../src/core/audit/gitignore.js';
import { printWelcome } from '../src/core/welcome/welcomeScreen.js';
import { textToBraille, applyGradient } from '../src/core/welcome/brailleText.js';
import {
  ScanResult,
  AnalysisResult,
  ScoreResult,
  AuditDetectionResult,
} from '../src/types/index.js';
import { encodeScan, decodeResponse } from '../src/utils/fewserial.js';
import { saveToken, readValidToken, clearToken, peekJwt } from '../src/utils/tokenStorage.js';
import { maskPath } from '../src/utils/pathMask.js';

// URL split to avoid trivial grep-based discovery in the bundled binary.
// Real protection is server-side rate-limit + required x-archradar header.
const ARCHRADAR_API =
  process.env.ARCHRADAR_API_URL ??
  ['https://archradar-api', 'fewcompany', 'com'].join('.');
const ARCHRADAR_VERSION = '1.4.3';

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'x-archradar': ARCHRADAR_VERSION,
    'User-Agent': `archradar-cli/${ARCHRADAR_VERSION}`,
    ...extra,
  };
}

interface PremiumInsights {
  prevScore: number;
  currentScore: number;
  delta: number;
  trend: 'up' | 'down' | 'stable';
  insights: string[];
}

interface ScanContext {
  scan?: ScanResult;
  analysis?: AnalysisResult;
  score?: ScoreResult;
  premium?: PremiumInsights;
  premiumError?: string;
}

interface AuditContext {
  scan?: ScanResult;
  analysis?: AnalysisResult;
  score?: ScoreResult;
  audit?: AuditDetectionResult;
  auditResponse?: AuditApiResponse;
}

async function fetchPremium(
  scan: ScanResult,
  analysis: AnalysisResult,
  score: ScoreResult,
  token: string
): Promise<PremiumInsights> {
  // Mask file paths before sending — API never sees the user's real folder structure.
  const topCoupling = [...analysis.coupling.perFileImports]
    .sort((a, b) => b.imports - a.imports)
    .slice(0, 30)
    .map((c) => ({ file: maskPath(c.file), imports: c.imports }));
  const topCouplingFiles = new Set(
    analysis.coupling.perFileImports
      .sort((a, b) => b.imports - a.imports)
      .slice(0, 30)
      .map((c) => c.file)
  );

  const edges: Array<{ from: string; to: string }> = [];
  for (const [from, tos] of Object.entries(analysis.circularDeps.graph)) {
    if (!topCouplingFiles.has(from)) continue;
    for (const to of tos) edges.push({ from: maskPath(from), to: maskPath(to) });
  }

  const payload = encodeScan({
    framework: scan.framework.framework,
    version: scan.framework.version,
    totalFiles: scan.files.totalFiles,
    avgLines: scan.files.avgLinesPerFile,
    healthScore: score.health.score,
    grade: score.health.grade,
    avgCoupling: analysis.coupling.avgCoupling,
    avgComplexity: analysis.complexity.avgComplexity,
    circularDeps: analysis.circularDeps.allCycles.length,
    criticalFiles: scan.files.criticalFiles.length,
    // Sentinel -1 = modularity not applicable (backend-only project).
    modularityScore: analysis.modularity.modularityScore ?? -1,
    hotspots: analysis.complexity.hotspots.map((h) => ({
      file: maskPath(h.file),
      fn: h.function,
      score: h.complexity,
    })),
    coupling: topCoupling,
    edges,
    cycles: analysis.circularDeps.allCycles
      .slice(0, 50)
      .map((cycle) => cycle.map(maskPath)),
    critical: scan.files.criticalFiles.slice(0, 50).map((f) => ({
      path: maskPath(f.path),
      lines: f.lines,
    })),
    violations: analysis.modularity.violations.map((v) => ({
      file: maskPath(v.file),
      type: v.type,
      count: v.count,
    })),
    deps: scan.dependencies.all,
  });

  const res = await fetch(`${ARCHRADAR_API}/api/v1/scan/premium`, {
    method: 'POST',
    headers: apiHeaders({
      'Content-Type': 'application/x-fewserial',
      Authorization: `Bearer ${token}`,
    }),
    body: payload,
  });

  if (!res.ok) {
    throw new Error(`API responded with ${res.status}`);
  }

  const raw = await res.text();
  return decodeResponse(raw);
}

async function fetchAudit(
  scan: ScanResult,
  analysis: AnalysisResult,
  score: ScoreResult,
  auditData: AuditDetectionResult,
  token: string
): Promise<AuditApiResponse> {
  const topCoupling = [...analysis.coupling.perFileImports]
    .sort((a, b) => b.imports - a.imports)
    .slice(0, 30);
  const topCouplingSet = new Set(topCoupling.map((c) => c.file));

  const edges: Array<{ from: string; to: string }> = [];
  for (const [from, tos] of Object.entries(analysis.circularDeps.graph)) {
    if (!topCouplingSet.has(from)) continue;
    for (const to of tos) edges.push({ from: maskPath(from), to: maskPath(to) });
  }

  const payload = encodeScan({
    framework: scan.framework.framework,
    version: scan.framework.version,
    totalFiles: scan.files.totalFiles,
    avgLines: scan.files.avgLinesPerFile,
    healthScore: score.health.score,
    grade: score.health.grade,
    avgCoupling: analysis.coupling.avgCoupling,
    avgComplexity: analysis.complexity.avgComplexity,
    circularDeps: analysis.circularDeps.allCycles.length,
    criticalFiles: scan.files.criticalFiles.length,
    // Sentinel -1 = modularity not applicable (backend-only project).
    modularityScore: analysis.modularity.modularityScore ?? -1,
    mode: 'audit',
    hotspots: analysis.complexity.hotspots.map((h) => ({
      file: maskPath(h.file),
      fn: h.function,
      score: h.complexity,
    })),
    coupling: topCoupling.map((c) => ({ file: maskPath(c.file), imports: c.imports })),
    edges,
    cycles: analysis.circularDeps.allCycles.slice(0, 50).map((cycle) => cycle.map(maskPath)),
    critical: scan.files.criticalFiles.slice(0, 50).map((f) => ({
      path: maskPath(f.path),
      lines: f.lines,
    })),
    violations: analysis.modularity.violations.map((v) => ({
      file: maskPath(v.file),
      type: v.type,
      count: v.count,
    })),
    deps: scan.dependencies.all,
    barrels: auditData.barrels.barrels.map((b) => ({
      file: maskPath(b.file),
      reExportCount: b.reExportCount,
    })),
    godComponents: auditData.godComponents.suspects.map((g) => ({
      file: maskPath(g.file),
      lines: g.lines,
      imports: g.imports,
      hooks: g.hookUsage,
      jsxReturns: g.jsxReturns,
      reasons: g.reasons,
    })),
  });

  const res = await fetch(`${ARCHRADAR_API}/api/v1/scan/audit`, {
    method: 'POST',
    headers: apiHeaders({
      'Content-Type': 'application/x-fewserial',
      Authorization: `Bearer ${token}`,
    }),
    body: payload,
  });

  if (!res.ok) {
    let hint = '';
    try {
      const body = await res.json() as { message?: string };
      if (body.message) hint = `\n  ${body.message}`;
    } catch { /* ignore parse errors */ }
    throw new Error(`Audit API responded with ${res.status}${hint}`);
  }

  return (await res.json()) as AuditApiResponse;
}

// ===== Commands =====

function getSignedInUser(): { username: string; email: string | null } | null {
  const token = readValidToken();
  if (!token) return null;
  const payload = peekJwt(token);
  if (!payload) return null;
  return {
    username: (payload.githubUsername as string) ?? '',
    email: (payload.email as string) ?? null,
  };
}

async function showWelcome(): Promise<void> {
  const user = getSignedInUser();
  await printWelcome(user && user.username ? user : null);
}

async function runLogin(): Promise<void> {
  console.log('');
  console.log(chalk.bold('ARCHRADAR — GitHub Sign-in'));
  console.log('');

  // Step 1: request a device code
  const deviceRes = await fetch(`${ARCHRADAR_API}/api/v1/auth/github/device`, {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  });

  if (!deviceRes.ok) {
    console.error(chalk.red(`Failed to start sign-in (API ${deviceRes.status})`));
    process.exit(1);
  }

  const device = (await deviceRes.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };

  console.log(`  ${chalk.dim('1.')} Open this URL in your browser:`);
  console.log(`     ${chalk.cyan(device.verification_uri)}`);
  console.log('');
  console.log(`  ${chalk.dim('2.')} Enter this code:`);
  console.log(`     ${chalk.bold.white(device.user_code)}`);
  console.log('');
  console.log(chalk.dim(`  Waiting for GitHub approval (expires in ${Math.floor(device.expires_in / 60)} min)...`));
  console.log('');

  // Step 2: poll for the token
  const intervalMs = (device.interval || 5) * 1000;
  const deadline = Date.now() + device.expires_in * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const pollRes = await fetch(`${ARCHRADAR_API}/api/v1/auth/github/poll`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ device_code: device.device_code }),
    });

    if (pollRes.status === 202) continue;
    if (pollRes.status === 429) continue;
    if (pollRes.status === 410) {
      console.error(chalk.red('Sign-in code expired. Run `archradar login` again.'));
      process.exit(1);
    }
    if (pollRes.status === 403) {
      console.error(chalk.red('Sign-in denied by user.'));
      process.exit(1);
    }

    if (pollRes.ok) {
      const data = (await pollRes.json()) as {
        token: string;
        user: { username: string; email: string | null };
      };
      saveToken(data.token);
      console.log(chalk.green(`  ✓ Signed in as @${data.user.username}${data.user.email ? ` (${data.user.email})` : ''}`));
      console.log('');
      console.log(chalk.dim(`  Premium analysis enabled. Run `) + chalk.cyan('archradar scan') + chalk.dim(' to use it.'));
      console.log('');
      return;
    }

    console.error(chalk.red(`Unexpected response (${pollRes.status}). Retrying...`));
  }

  console.error(chalk.red('Sign-in timed out.'));
  process.exit(1);
}

function runWhoami(): void {
  const user = getSignedInUser();
  if (!user || !user.username) {
    console.log('');
    console.log(chalk.dim('Not signed in. Run ') + chalk.cyan('archradar login') + chalk.dim(' to connect with GitHub.'));
    console.log('');
    return;
  }
  console.log('');
  console.log(`  ${chalk.green('✓')} Signed in as ${chalk.cyan('@' + user.username)}${user.email ? chalk.dim(` (${user.email})`) : ''}`);
  console.log('');
}

function runLogout(): void {
  clearToken();
  console.log('');
  console.log(chalk.dim('  Signed out. Premium analysis disabled.'));
  console.log('');
}

// ===== Main program =====

function brailleHeaderBanner(): string {
  const braille = textToBraille('ARCHRADAR');
  const colored = applyGradient(braille, '#00d4ff', '#ff00ff');
  return (
    '\n' +
    colored +
    '\n' +
    chalk.dim('  Architectural Intelligence Engine — by Few Company') +
    '\n'
  );
}

// Commander builds help text by stitching together sections returned by
// the `formatHelp` method. We override it to inject the Braille header
// before the standard help output.
class BrandedCommand extends Command {
  createCommand(name: string): BrandedCommand {
    return new BrandedCommand(name);
  }
}

const program = new BrandedCommand();

// Inject the branded header into every help output (archradar -h,
// archradar scan -h, archradar audit -h, etc.).
program.configureHelp({
  formatHelp(cmd, helper) {
    const base = Command.prototype
      .createCommand('')
      .createHelp()
      .formatHelp(cmd, helper);
    return brailleHeaderBanner() + '\n' + base;
  },
});

program
  .name('archradar')
  .description('Architectural Intelligence Engine for modern frontend teams — by Few Company')
  .version(ARCHRADAR_VERSION);

program
  .command('scan [projectPath]')
  .description('Analyze the architectural health of a frontend project')
  .option('--json', 'Output results as JSON')
  .option('--no-premium', 'Skip the premium insights request (logged-in users only)')
  .action(
    async (
      projectPath?: string,
      opts?: { json?: boolean; premium?: boolean }
    ) => {
      const targetPath = path.resolve(projectPath ?? '.');
      const token = readValidToken();
      const wantsPremium = token !== null && opts?.premium !== false;

      const ctx: ScanContext = {};

      const taskList: Array<{
        title: string;
        enabled?: () => boolean;
        task: (c: ScanContext, task: { skip: (msg: string) => void }) => Promise<void> | void;
      }> = [
        {
          title: 'Scanning project files',
          task: async (c) => {
            c.scan = await Scanner.run(targetPath);
          },
        },
        {
          title: 'Running AST analysis',
          task: async (c) => {
            c.analysis = await Analyzer.run(targetPath);
          },
        },
        {
          title: 'Calculating architectural score',
          task: (c) => {
            if (!c.scan || !c.analysis) throw new Error('Scan or analysis missing');
            c.score = ScoreEngine.run(c.scan, c.analysis);
          },
        },
      ];

      if (wantsPremium && token) {
        taskList.push({
          title: 'Fetching premium insights',
          task: async (c, task) => {
            if (!c.scan || !c.analysis || !c.score) throw new Error('Prerequisites missing');
            try {
              c.premium = await fetchPremium(c.scan, c.analysis, c.score, token);
            } catch (err) {
              c.premiumError = err instanceof Error ? err.message : String(err);
              task.skip('Premium insights unavailable — showing local report only');
            }
          },
        });
      }

      const tasks = new Listr<ScanContext, 'simple'>(taskList, {
        concurrent: false,
        renderer: 'simple',
      });

      try {
        await tasks.run(ctx);
      } catch (err) {
        console.error(chalk.red('\nAnalysis failed:'));
        if (err instanceof Error) console.error(err.message);
        process.exit(1);
      }

      if (!ctx.scan || !ctx.analysis || !ctx.score) {
        console.error(chalk.red('\nAnalysis failed: incomplete result'));
        process.exit(1);
      }

      if (opts?.json) {
        console.log(
          JSON.stringify(
            {
              scan: ctx.scan,
              analysis: ctx.analysis,
              score: ctx.score,
              premium: ctx.premium ?? null,
            },
            null,
            2
          )
        );
        return;
      }

      const user = getSignedInUser();
      Reporter.display(ctx.scan, ctx.analysis, ctx.score, ctx.premium, user ?? undefined);
    }
  );

program
  .command('audit [projectPath]')
  .description('Deep architectural audit — generates a Markdown report (requires login)')
  .option('--no-gitignore', 'Do not auto-add .archradar/ to the project .gitignore')
  .action(
    async (
      projectPath?: string,
      opts?: { gitignore?: boolean }
    ) => {
      const targetPath = path.resolve(projectPath ?? '.');
      const token = readValidToken();

      if (!token) {
        console.log('');
        console.log(chalk.yellow('  ◆ Audit requires authentication.'));
        console.log(`  Run ${chalk.cyan('archradar login')} to sign in with GitHub.`);
        console.log('');
        process.exit(1);
      }

      const ctx: AuditContext = {};
      const tasks = new Listr<AuditContext, 'simple'>(
        [
          {
            title: 'Scanning project files',
            task: async (c) => {
              c.scan = await Scanner.run(targetPath);
            },
          },
          {
            title: 'Running AST analysis',
            task: async (c) => {
              c.analysis = await Analyzer.run(targetPath);
            },
          },
          {
            title: 'Running audit detectors (barrels, god components)',
            task: async (c) => {
              c.audit = await runAudit(targetPath);
            },
          },
          {
            title: 'Calculating architectural score',
            task: (c) => {
              if (!c.scan || !c.analysis) throw new Error('Scan or analysis missing');
              c.score = ScoreEngine.run(c.scan, c.analysis);
            },
          },
          {
            title: 'Requesting premium audit from API',
            task: async (c) => {
              if (!c.scan || !c.analysis || !c.score || !c.audit) {
                throw new Error('Prerequisites missing');
              }
              c.auditResponse = await fetchAudit(
                c.scan,
                c.analysis,
                c.score,
                c.audit,
                token
              );
            },
          },
        ],
        { concurrent: false, renderer: 'simple' }
      );

      try {
        await tasks.run(ctx);
      } catch (err) {
        console.error(chalk.red('\nAudit failed:'));
        if (err instanceof Error) console.error(err.message);
        process.exit(1);
      }

      if (!ctx.auditResponse || !ctx.scan) {
        console.error(chalk.red('\nAudit failed: incomplete result'));
        process.exit(1);
      }

      // Generate Markdown report
      const projectName = path.basename(ctx.scan.projectPath);
      const markdown = generateMarkdownReport(ctx.auditResponse, projectName);

      // Write to .archradar/audit-YYYY-MM-DD.md
      const today = new Date().toISOString().slice(0, 10);
      const outDir = path.join(targetPath, '.archradar');
      const outFile = path.join(outDir, `audit-${today}.md`);

      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      fs.writeFileSync(outFile, markdown);

      // Auto-update .gitignore unless --no-gitignore
      const wantsGitignore = opts?.gitignore !== false;
      let gitignoreMsg = '';
      if (wantsGitignore) {
        const result = ensureGitignore(targetPath);
        if (result.action === 'created') {
          gitignoreMsg = chalk.dim('  ℹ Created .gitignore with .archradar/');
        } else if (result.action === 'appended') {
          gitignoreMsg = chalk.dim('  ℹ Added .archradar/ to .gitignore');
        }
      }

      // Print summary
      const relOut = path.relative(targetPath, outFile).replace(/\\/g, '/');
      const findings =
        ctx.auditResponse.barrels.length +
        ctx.auditResponse.godComponents.length +
        ctx.auditResponse.correlations.length +
        ctx.auditResponse.depFindings.length +
        ctx.auditResponse.rankedCycles.length +
        ctx.auditResponse.frameworkSmells.length;
      const critical = ctx.auditResponse.depFindings.filter((d) => d.severity === 'critical').length;

      console.log('');
      console.log(chalk.green('  ✓ Audit generated at ') + chalk.cyan(relOut));
      console.log(
        chalk.dim(
          `    ${findings} findings · ${ctx.auditResponse.insights.length} insights · ${critical} critical issues`
        )
      );
      if (gitignoreMsg) console.log(gitignoreMsg);
      console.log('');
      console.log(chalk.dim('  Open the report in your editor or share it with your team.'));
      console.log('');
    }
  );

program
  .command('login')
  .description('Sign in with GitHub to unlock premium analysis')
  .action(async () => {
    await runLogin();
  });

program
  .command('whoami')
  .description('Show the currently signed-in user')
  .action(() => {
    runWhoami();
  });

program
  .command('logout')
  .description('Sign out and disable premium analysis')
  .action(() => {
    runLogout();
  });

// Show welcome screen when no command is given
if (process.argv.length === 2) {
  showWelcome().catch((err) => {
    console.error(chalk.red('Welcome screen failed:'), err instanceof Error ? err.message : err);
    process.exit(1);
  });
} else {
  program.parse(process.argv);
}
