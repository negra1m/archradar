import fs from 'fs/promises';
import path from 'path';
import { StructureScanResult } from '../../types/index.js';

const KNOWN_PATTERNS: Array<{ name: string; required: string[] }> = [
  { name: 'Feature-based', required: ['features', 'modules'] },
  { name: 'Next.js App Router', required: ['app'] },
  { name: 'Next.js Pages Router', required: ['pages'] },
  { name: 'Classic MVC', required: ['components', 'services', 'hooks'] },
  { name: 'Domain-driven', required: ['domain', 'infrastructure', 'application'] },
];

async function listDirs(dirPath: string, depth: number, maxDepth: number): Promise<string[]> {
  if (depth > maxDepth) return [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const dirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = path.join(dirPath, entry.name);
    dirs.push(entry.name);
    const children = await listDirs(fullPath, depth + 1, maxDepth);
    dirs.push(...children.map((c) => `${entry.name}/${c}`));
  }

  return dirs;
}

export async function scanStructure(projectPath: string): Promise<StructureScanResult> {
  const folders = await listDirs(projectPath, 0, 3);
  const topLevel = folders.filter((f) => !f.includes('/'));

  // Find the best-fitting pattern by match ratio (covered required folders
  // over total required). This replaces the old all-or-nothing matching
  // where a 4-of-5 match was indistinguishable from a 2-of-8 match.
  let bestMatch: { name: string; ratio: number } | null = null;
  for (const { name, required } of KNOWN_PATTERNS) {
    const hits = required.filter((r) => topLevel.includes(r)).length;
    const ratio = hits / required.length;
    if (ratio > 0 && (!bestMatch || ratio > bestMatch.ratio)) {
      bestMatch = { name, ratio };
    }
  }

  let patternName = 'Unrecognized';
  let hasRecognizedPattern = false;
  let matchConfidence = 0;

  if (bestMatch && bestMatch.ratio >= 1) {
    // Full match — the pattern is clearly in use.
    patternName = bestMatch.name;
    hasRecognizedPattern = true;
    matchConfidence = 100;
  } else if (bestMatch && bestMatch.ratio >= 0.5) {
    // Partial match — pattern is recognizable but not fully adopted.
    patternName = `${bestMatch.name} (partial)`;
    hasRecognizedPattern = true;
    matchConfidence = Math.round(bestMatch.ratio * 100);
  } else {
    // No strong pattern — fall back to the "some common folders" heuristic
    // so projects using ad-hoc conventions aren't penalized as "unstructured".
    const commonDirs = ['components', 'pages', 'hooks', 'utils', 'services', 'store', 'lib', 'api', 'app'];
    const found = topLevel.filter((f) => commonDirs.includes(f));
    if (found.length >= 2) {
      hasRecognizedPattern = true;
      patternName = 'Ad-hoc structure';
      matchConfidence = Math.round((found.length / commonDirs.length) * 100);
    }
  }

  return { folders: topLevel, hasRecognizedPattern, patternName, matchConfidence };
}
