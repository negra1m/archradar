import { detectBarrelFiles } from './barrelDetector.js';
import { detectGodComponents } from './godComponentDetector.js';
import { AuditDetectionResult } from '../../types/index.js';

/**
 * Run audit-level detectors that aren't part of the quick scan.
 * Only invoked by the `archradar audit` command, not the regular `scan`.
 */
export async function runAudit(projectPath: string): Promise<AuditDetectionResult> {
  const [barrels, godComponents] = await Promise.all([
    detectBarrelFiles(projectPath),
    detectGodComponents(projectPath),
  ]);
  return { barrels, godComponents };
}
