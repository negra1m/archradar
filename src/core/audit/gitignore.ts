// gitignore — ensures `.archradar/` is in the project's .gitignore so that
// audit reports don't accidentally get committed. Opt-out via --no-gitignore.

import fs from 'fs';
import path from 'path';

const ENTRY = '.archradar/';
const MARKER_COMMENT = '# archradar audit reports (auto-added)';

export interface GitignoreResult {
  action: 'created' | 'appended' | 'already-present' | 'skipped';
  path: string;
}

export function ensureGitignore(projectPath: string): GitignoreResult {
  const gitignorePath = path.join(projectPath, '.gitignore');

  // If the project isn't a git repo, skip silently.
  if (!fs.existsSync(path.join(projectPath, '.git'))) {
    return { action: 'skipped', path: gitignorePath };
  }

  if (!fs.existsSync(gitignorePath)) {
    const content = `${MARKER_COMMENT}\n${ENTRY}\n`;
    fs.writeFileSync(gitignorePath, content);
    return { action: 'created', path: gitignorePath };
  }

  const existing = fs.readFileSync(gitignorePath, 'utf-8');
  const lines = existing.split('\n').map((l) => l.trim());
  const already = lines.some((l) => l === ENTRY || l === '.archradar' || l === '.archradar/*');

  if (already) {
    return { action: 'already-present', path: gitignorePath };
  }

  const prefix = existing.endsWith('\n') ? '' : '\n';
  const appended = `${prefix}\n${MARKER_COMMENT}\n${ENTRY}\n`;
  fs.appendFileSync(gitignorePath, appended);
  return { action: 'appended', path: gitignorePath };
}
