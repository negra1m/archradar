import fg from 'fast-glob';
import fs from 'fs/promises';
import path from 'path';
import { BarrelDetectionResult, BarrelFile } from '../../types/index.js';

const BARREL_THRESHOLD = 10;
const INDEX_PATTERNS = [
  '**/index.ts',
  '**/index.tsx',
  '**/index.js',
  '**/index.jsx',
];
const IGNORED = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/build/**',
  '**/.nuxt/**',
];

// Matches lines like:
//   export * from './foo';
//   export { A, B } from './bar';
//   export { default as Foo } from './foo';
const RE_EXPORT_RE = /^\s*export\s+(\*|\{[^}]*\})\s+from\s+['"][^'"]+['"]/gm;

/**
 * Detect "barrel hell" — index files that re-export many modules.
 *
 * Barrel files are convenient but can defeat tree-shaking, slow down
 * type-checking, and cause circular-import headaches. A barrel file
 * re-exporting 10+ modules is the canonical smell we flag.
 */
export async function detectBarrelFiles(projectPath: string): Promise<BarrelDetectionResult> {
  const entries = await fg(INDEX_PATTERNS, {
    cwd: projectPath,
    ignore: IGNORED,
    onlyFiles: true,
    absolute: false,
  });

  const barrels: BarrelFile[] = [];

  for (const rel of entries) {
    const abs = path.join(projectPath, rel);
    let content: string;
    try {
      content = await fs.readFile(abs, 'utf-8');
    } catch {
      continue;
    }

    const matches = content.match(RE_EXPORT_RE);
    const reExportCount = matches?.length ?? 0;

    if (reExportCount >= BARREL_THRESHOLD) {
      barrels.push({ file: rel, reExportCount });
    }
  }

  barrels.sort((a, b) => b.reExportCount - a.reExportCount);

  return {
    hasBarrels: barrels.length > 0,
    barrels,
    threshold: BARREL_THRESHOLD,
  };
}
