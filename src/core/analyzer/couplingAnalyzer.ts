import { CouplingResult } from '../../types/index.js';
import { topK } from '../../utils/topK.js';
import { AnalysisContext, resolveContext } from './context.js';

/**
 * Single source of truth for the "high coupling" threshold.
 * A file is flagged as high-coupling when it has >= this many imports.
 *
 * Chosen as 12 based on calibration across 97 real OSS repos
 * (p90 of avg coupling ~6, p99 ~12 — a per-file count of 12 lands in
 * the real tail of the distribution).
 *
 * The same constant is imported by healthScore.ts to keep the analyzer
 * detection and the scoring curve aligned — no more contradictions where
 * a file is flagged as high-coupling while the score says "all green".
 */
export const HIGH_COUPLING_THRESHOLD = 12;

export async function analyzeCoupling(
  projectPath: string,
  ctx?: AnalysisContext
): Promise<CouplingResult> {
  const { sourceFiles, rel } = resolveContext(projectPath, ctx);

  const highCouplingFiles: CouplingResult['highCouplingFiles'] = [];
  const perFileImports: CouplingResult['perFileImports'] = [];
  let totalImports = 0;
  let fileCount = 0;

  for (const sourceFile of sourceFiles) {
    const imports = sourceFile.getImportDeclarations();
    const importCount = imports.length;
    // POSIX-normalize so paths match across Windows and Linux.
    const filePath = rel(sourceFile.getFilePath());

    totalImports += importCount;
    fileCount++;
    perFileImports.push({ file: filePath, imports: importCount });

    if (importCount >= HIGH_COUPLING_THRESHOLD) {
      highCouplingFiles.push({ file: filePath, imports: importCount });
    }
  }

  // Stable order for the full list — it feeds the premium payload and any
  // downstream ranking; readdir/glob order must not leak into the output.
  perFileImports.sort((a, b) => b.imports - a.imports || a.file.localeCompare(b.file));

  // Total order: imports desc, ties broken by file path.
  const top10 = topK(
    highCouplingFiles,
    10,
    (f) => f.imports,
    (a, b) => a.file.localeCompare(b.file)
  );

  return {
    avgCoupling: fileCount > 0 ? Math.round(totalImports / fileCount) : 0,
    highCouplingFiles: top10,
    perFileImports,
  };
}
