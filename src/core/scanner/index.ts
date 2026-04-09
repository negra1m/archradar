import { scanFiles } from './fileScanner.js';
import { detectFramework } from './frameworkDetector.js';
import { scanDependencies } from './dependencyScanner.js';
import { scanStructure } from './structureScanner.js';
import { ScanResult } from '../../types/index.js';

export async function run(projectPath: string): Promise<ScanResult> {
  const [framework, files, dependencies, structure] = await Promise.all([
    detectFramework(projectPath),
    scanFiles(projectPath),
    scanDependencies(projectPath),
    scanStructure(projectPath),
  ]);

  return { projectPath, framework, files, dependencies, structure };
}
