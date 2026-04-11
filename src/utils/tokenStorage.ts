// Token storage for the archradar CLI.
// Persists the JWT returned by GitHub OAuth at ~/.archradar/token.
// File permissions set to 0600 (owner read/write only) on Unix.

import os from 'os';
import path from 'path';
import fs from 'fs';

const TOKEN_DIR = path.join(os.homedir(), '.archradar');
const TOKEN_PATH = path.join(TOKEN_DIR, 'token');

export function saveToken(token: string): void {
  if (!fs.existsSync(TOKEN_DIR)) {
    fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
}

export function readToken(): string | null {
  try {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const token = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function clearToken(): void {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
  } catch {
    // ignore — logout is best-effort
  }
}

/**
 * Decode a JWT payload without verifying the signature.
 * Used only for local display (whoami); the server validates on every request.
 */
export function peekJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

/**
 * Read the stored token and verify it looks usable client-side:
 * - decodes as JWT
 * - not expired (exp field in future)
 * - has a githubUsername claim
 *
 * Returns the raw token string only if all checks pass. Corrupted or expired
 * tokens are silently auto-cleared so the next run shows the guest welcome.
 *
 * This is a client-side sanity check, NOT a security check — the API still
 * validates signature + expiration on every authenticated request.
 */
export function readValidToken(): string | null {
  const token = readToken();
  if (!token) return null;

  const payload = peekJwt(token);
  if (!payload) {
    clearToken();
    return null;
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  if (exp !== null) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (exp <= nowSeconds) {
      clearToken();
      return null;
    }
  }

  if (typeof payload.githubUsername !== 'string' || !payload.githubUsername) {
    clearToken();
    return null;
  }

  return token;
}
