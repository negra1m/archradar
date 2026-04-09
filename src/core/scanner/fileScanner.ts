import fg from 'fast-glob';
import fs from 'fs/promises';
import path from 'path';
import { FileScanResult, FileInfo } from '../../types/index.js';

const CRITICAL_LINE_THRESHOLD = 300;

export async function scanFiles(projectPath: string): Promise<FileScanResult> {
  const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue', '**/*.svelte'];
  const ignore = ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/build/**', '**/.nuxt/**'];

  const files = await fg(patterns, {
    cwd: projectPath,
    ignore,
    absolute: true,
  });

  if (files.length === 0) {
    return { totalFiles: 0, avgLinesPerFile: 0, criticalFiles: [] };
  }

  const fileInfos: FileInfo[] = [];
  let totalLines = 0;

  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').length;
      const stats = await fs.stat(filePath);
      fileInfos.push({ path: path.relative(projectPath, filePath), lines, sizeBytes: stats.size });
      totalLines += lines;
    } catch {
      // skip unreadable files
    }
  }

  const criticalFiles = fileInfos
    .filter((f) => f.lines > CRITICAL_LINE_THRESHOLD)
    .sort((a, b) => b.lines - a.lines);

  return {
    totalFiles: fileInfos.length,
    avgLinesPerFile: Math.round(totalLines / fileInfos.length),
    criticalFiles,
  };
}
