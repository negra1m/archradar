import fs from 'fs/promises';
import path from 'path';
import { FrameworkInfo } from '../../types/index.js';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const FRAMEWORK_MAP: Array<{ key: string; name: string }> = [
  { key: 'next', name: 'Next.js' },
  { key: 'nuxt', name: 'Nuxt' },
  { key: '@angular/core', name: 'Angular' },
  { key: 'react', name: 'React' },
  { key: 'vue', name: 'Vue' },
  { key: 'svelte', name: 'Svelte' },
  { key: 'solid-js', name: 'SolidJS' },
  { key: 'astro', name: 'Astro' },
  { key: 'remix', name: 'Remix' },
];

const BUNDLER_MAP: Array<{ key: string; name: string }> = [
  { key: 'vite', name: 'Vite' },
  { key: 'webpack', name: 'Webpack' },
  { key: 'turbopack', name: 'Turbopack' },
  { key: 'parcel', name: 'Parcel' },
  { key: 'rollup', name: 'Rollup' },
  { key: 'esbuild', name: 'esbuild' },
];

export async function detectFramework(projectPath: string): Promise<FrameworkInfo> {
  const pkgPath = path.join(projectPath, 'package.json');

  try {
    const raw = await fs.readFile(pkgPath, 'utf-8');
    const pkg: PackageJson = JSON.parse(raw);
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const depKeys = Object.keys(allDeps);

    let framework = 'Unknown';
    let version = '';
    for (const { key, name } of FRAMEWORK_MAP) {
      if (depKeys.includes(key)) {
        framework = name;
        version = allDeps[key]?.replace(/[\^~>=<]/g, '') ?? '';
        break;
      }
    }

    let bundler = 'Unknown';
    for (const { key, name } of BUNDLER_MAP) {
      if (depKeys.includes(key)) {
        bundler = name;
        break;
      }
    }

    // Next.js uses Turbopack/Webpack internally
    if (framework === 'Next.js' && bundler === 'Unknown') bundler = 'Webpack/Turbopack';

    return { framework, version, bundler };
  } catch {
    return { framework: 'Unknown', version: '', bundler: 'Unknown' };
  }
}
