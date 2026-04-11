import fs from 'fs/promises';
import path from 'path';
import { DependencyScanResult, DependencyInfo } from '../../types/index.js';

// Groups of libs that serve the same purpose — having 2+ is suspicious
const OVERLAP_GROUPS: Record<string, string[]> = {
  'state-management': ['redux', 'zustand', 'jotai', 'recoil', 'mobx', 'valtio', 'pinia', '@ngrx/store'],
  'http-client': ['axios', 'ky', 'got', 'node-fetch', 'superagent', 'wretch'],
  'styling': ['styled-components', '@emotion/react', 'linaria', 'vanilla-extract', 'stitches'],
  'forms': ['react-hook-form', 'formik', 'final-form', 'vee-validate'],
  'date': ['moment', 'dayjs', 'date-fns', 'luxon'],
  'testing': ['jest', 'vitest', 'mocha', 'jasmine'],
};

const HEAVY_DEPS = ['moment', 'lodash', 'jquery', 'rxjs', '@mui/material', 'antd', 'semantic-ui-react'];

export async function scanDependencies(projectPath: string): Promise<DependencyScanResult> {
  const pkgPath = path.join(projectPath, 'package.json');

  try {
    const raw = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    const deps: Record<string, string> = { ...pkg.dependencies };
    const devDeps: Record<string, string> = { ...pkg.devDependencies };
    const allDeps = { ...deps, ...devDeps };
    const depKeys = Object.keys(allDeps);

    const suspiciousDeps: string[] = [];
    for (const [group, libs] of Object.entries(OVERLAP_GROUPS)) {
      const found = depKeys.filter((d) => libs.includes(d));
      if (found.length > 1) {
        suspiciousDeps.push(`Múltiplas libs de ${group}: ${found.join(', ')}`);
      }
    }

    const heavyDeps = depKeys.filter((d) => HEAVY_DEPS.includes(d));

    const all: DependencyInfo[] = [
      ...Object.entries(deps).map(([name, version]) => ({
        name,
        version: String(version).replace(/^[\^~]/, ''),
        category: 'runtime' as const,
      })),
      ...Object.entries(devDeps).map(([name, version]) => ({
        name,
        version: String(version).replace(/^[\^~]/, ''),
        category: 'dev' as const,
      })),
    ];

    return {
      totalDeps: depKeys.length,
      suspiciousDeps,
      heavyDeps,
      all,
    };
  } catch {
    return { totalDeps: 0, suspiciousDeps: [], heavyDeps: [], all: [] };
  }
}
