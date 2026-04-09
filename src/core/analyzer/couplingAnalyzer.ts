import { Project } from 'ts-morph';
import path from 'path';
import { CouplingResult } from '../../types/index.js';
import { topK } from '../../utils/topK.js';

const HIGH_COUPLING_THRESHOLD = 15;

export async function analyzeCoupling(projectPath: string): Promise<CouplingResult> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  project.addSourceFilesAtPaths([
    path.join(projectPath, '**/*.ts'),
    path.join(projectPath, '**/*.tsx'),
    `!${path.join(projectPath, '**/node_modules/**')}`,
    `!${path.join(projectPath, '**/dist/**')}`,
    `!${path.join(projectPath, '**/.next/**')}`,
  ]);

  const highCouplingFiles: CouplingResult['highCouplingFiles'] = [];
  let totalImports = 0;
  let fileCount = 0;

  for (const sourceFile of project.getSourceFiles()) {
    const imports = sourceFile.getImportDeclarations();
    const importCount = imports.length;
    const filePath = path.relative(projectPath, sourceFile.getFilePath());

    totalImports += importCount;
    fileCount++;

    if (importCount >= HIGH_COUPLING_THRESHOLD) {
      highCouplingFiles.push({ file: filePath, imports: importCount });
    }
  }

  const top10 = topK(highCouplingFiles, 10, (f) => f.imports);
  top10.sort((a, b) => b.imports - a.imports);

  return {
    avgCoupling: fileCount > 0 ? Math.round(totalImports / fileCount) : 0,
    highCouplingFiles: top10,
  };
}
