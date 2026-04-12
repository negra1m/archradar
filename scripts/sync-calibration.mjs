#!/usr/bin/env node
// v1.4 Sprint 8 — Sync calibration.fewserial from archradar-api into the CLI.
//
// Reason: scoring core must work offline. The CLI needs the framework profile
// data (per-framework p90 thresholds, percentile bands) without making any
// HTTP calls. We embed the same .fewserial that the API serves.
//
// Run automatically before `npm run build`. Manual: `node scripts/sync-calibration.js`.
//
// Source path is relative to the monorepo layout:
//   archradar/         <- this repo
//   archradar-api/     <- sibling, contains the canonical .fewserial
//
// If the API repo isn't checked out next door, we leave the existing copy
// (or no-op if there's none) — the CLI fallback path handles missing data.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE = path.resolve(
  __dirname,
  '../../archradar-api/src/data/calibration.fewserial'
);
const DEST_DIR = path.resolve(__dirname, '../src/data');
const DEST = path.join(DEST_DIR, 'calibration.fewserial');

if (!fs.existsSync(SOURCE)) {
  console.log(
    '[sync-calibration] source not found at ' +
      SOURCE +
      ' — keeping existing CLI copy (or none)'
  );
  process.exit(0);
}

if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

const content = fs.readFileSync(SOURCE, 'utf-8');
fs.writeFileSync(DEST, content);
console.log(
  '[sync-calibration] copied ' + content.length + ' bytes to ' + DEST
);
