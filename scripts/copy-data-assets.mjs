#!/usr/bin/env node
// Copy src/data/* into dist/src/data/* so the published CLI bundle has
// the calibration.fewserial alongside the compiled JS.
//
// Filter: only `.fewserial` and `.json` files. Ignores `.bak`, `.md`, etc.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC = path.resolve(__dirname, '../src/data');
const DEST = path.resolve(__dirname, '../dist/src/data');

const ALLOWED_EXT = new Set(['.fewserial', '.json']);

if (!fs.existsSync(SRC)) {
  console.log('[copy-data-assets] no src/data, skipping');
  process.exit(0);
}

if (!fs.existsSync(DEST)) {
  fs.mkdirSync(DEST, { recursive: true });
}

let copied = 0;
for (const entry of fs.readdirSync(SRC)) {
  const ext = path.extname(entry);
  if (!ALLOWED_EXT.has(ext)) continue;
  const srcPath = path.join(SRC, entry);
  const destPath = path.join(DEST, entry);
  fs.copyFileSync(srcPath, destPath);
  copied++;
}
console.log('[copy-data-assets] copied ' + copied + ' file(s) to ' + DEST);
