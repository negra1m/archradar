import fg from 'fast-glob';
import fs from 'fs/promises';
import path from 'path';
import { FileScanResult, FileInfo } from '../../types/index.js';

const CRITICAL_LINE_THRESHOLD = 300;

/**
 * v1.4 Sprint 10 #19 — Minimum expected source file count per framework.
 *
 * If a scan finds fewer source files than this for a given framework, we
 * emit a warning. Usually indicates:
 *   - .gitignore is hiding source directories
 *   - running archradar in a monorepo subdirectory by mistake
 *   - incomplete scaffold (starter template not yet built out)
 *
 * Values are conservative minimums for a real working project, not
 * opinions about what a "good" project looks like.
 */
const FRAMEWORK_MIN_FILES: Record<string, number> = {
  'Next.js': 20,
  React: 10,
  Vue: 15,
  Angular: 25,
};

export function shouldWarnSmallScan(framework: string, totalFiles: number): boolean {
  const min = FRAMEWORK_MIN_FILES[framework];
  if (!min) return false;
  return totalFiles < min;
}

/**
 * v1.4 Sprint 4 — Separate test files from source files.
 *
 * A file is considered a test if it matches any of:
 *   - `*.test.{ts,tsx,js,jsx}`
 *   - `*.spec.{ts,tsx,js,jsx}`
 *   - inside a `__tests__` directory at any depth
 *   - inside a top-level `tests/` or `test/` directory
 *
 * This check is intentionally strict: we want to count files whose
 * PURPOSE is testing, not files that happen to mention "test" in their path.
 */
function isTestFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  if (/\.test\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized)) return true;
  if (/\.spec\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized)) return true;
  if (/\/__tests__\//.test(normalized)) return true;
  // Leading `tests/` or `test/` at the project root.
  if (/^tests?\//.test(normalized)) return true;
  return false;
}

export async function scanFiles(projectPath: string): Promise<FileScanResult> {
  const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue', '**/*.svelte'];
  const ignore = ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/build/**', '**/.nuxt/**'];

  const files = await fg(patterns, {
    cwd: projectPath,
    ignore,
    absolute: true,
  });

  if (files.length === 0) {
    return {
      totalFiles: 0,
      avgLinesPerFile: 0,
      criticalFiles: [],
      sourceFileCount: 0,
      testFileCount: 0,
      testCoverageRatio: 0,
    };
  }

  const fileInfos: FileInfo[] = [];
  const testFiles: string[] = [];
  let totalLines = 0;
  let sourceCount = 0;

  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').length;
      const stats = await fs.stat(filePath);
      const rel = path.relative(projectPath, filePath);
      const isTest = isTestFile(rel);

      if (isTest) {
        testFiles.push(rel);
      } else {
        sourceCount++;
        fileInfos.push({ path: rel, lines, sizeBytes: stats.size });
        totalLines += lines;
      }
    } catch {
      // skip unreadable files
    }
  }

  const criticalFiles = fileInfos
    .filter((f) => f.lines > CRITICAL_LINE_THRESHOLD)
    .sort((a, b) => b.lines - a.lines);

  // Proxy for test culture, NOT real coverage. Ratio of test files to source
  // files. Mature projects typically have ~1 test file per 2-3 source files
  // (ratio 0.3-0.5). Projects with zero test files → ratio 0, score 20.
  const testCoverageRatio = sourceCount > 0 ? testFiles.length / sourceCount : 0;

  return {
    totalFiles: fileInfos.length,  // source-file count, backwards-compatible with v1.3 reporting
    avgLinesPerFile: sourceCount > 0 ? Math.round(totalLines / sourceCount) : 0,
    criticalFiles,
    sourceFileCount: sourceCount,
    testFileCount: testFiles.length,
    testCoverageRatio,
  };
}
