// brailleText — render text as small dot-matrix Braille art.
// Uses a 5x8 bitmap font per character, then encodes each 2x4 pixel block
// into a Unicode Braille Pattern character (U+2800–U+28FF).
//
// Output for "ARCHRADAR" is roughly 27 chars wide × 2 rows tall — the compact
// style used by Claude Code / KIRO CLI headers.

import chalk from 'chalk';

// Each glyph is 5 columns × 8 rows. '#' = filled pixel, '.' = empty.
// 8 rows = exactly 2 Braille cells tall (each cell is 4 rows).
const FONT_5X8: Record<string, string[]> = {
  A: [
    '.###.',
    '#...#',
    '#...#',
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '.....',
  ],
  R: [
    '####.',
    '#...#',
    '#...#',
    '####.',
    '#.#..',
    '#..#.',
    '#...#',
    '.....',
  ],
  C: [
    '.####',
    '#....',
    '#....',
    '#....',
    '#....',
    '#....',
    '.####',
    '.....',
  ],
  H: [
    '#...#',
    '#...#',
    '#...#',
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '.....',
  ],
  D: [
    '####.',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '####.',
    '.....',
  ],
  ' ': [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
  ],
};

const LETTER_WIDTH = 5;
const LETTER_HEIGHT = 8;
const LETTER_SPACING = 1;

/**
 * Render an uppercase ASCII string as a 2-row Braille dot-matrix banner.
 * Unknown characters render as blank space.
 */
export function textToBraille(text: string): string {
  const upper = text.toUpperCase();
  const letters = [...upper];
  if (letters.length === 0) return '';

  const cols = letters.length * LETTER_WIDTH + (letters.length - 1) * LETTER_SPACING;
  const bitmap: boolean[][] = Array.from({ length: LETTER_HEIGHT }, () =>
    Array.from({ length: cols }, () => false)
  );

  let xOffset = 0;
  for (const ch of letters) {
    const glyph = FONT_5X8[ch] ?? FONT_5X8[' '];
    for (let y = 0; y < LETTER_HEIGHT; y++) {
      for (let x = 0; x < LETTER_WIDTH; x++) {
        bitmap[y][xOffset + x] = glyph[y][x] === '#';
      }
    }
    xOffset += LETTER_WIDTH + LETTER_SPACING;
  }

  // Convert bitmap → Braille chars, 2 pixels wide × 4 pixels tall per char.
  const brailleRows: string[] = [];
  for (let by = 0; by < LETTER_HEIGHT; by += 4) {
    let rowStr = '';
    for (let bx = 0; bx < cols; bx += 2) {
      const pixel = (dy: number, dx: number): boolean => {
        const y = by + dy;
        const x = bx + dx;
        if (y >= LETTER_HEIGHT || x >= cols) return false;
        return bitmap[y][x];
      };
      // Unicode Braille Pattern dot bits:
      //   dot1 = 0x01  (row 0, col 0)
      //   dot2 = 0x02  (row 1, col 0)
      //   dot3 = 0x04  (row 2, col 0)
      //   dot4 = 0x08  (row 0, col 1)
      //   dot5 = 0x10  (row 1, col 1)
      //   dot6 = 0x20  (row 2, col 1)
      //   dot7 = 0x40  (row 3, col 0)
      //   dot8 = 0x80  (row 3, col 1)
      let bits = 0;
      if (pixel(0, 0)) bits |= 0x01;
      if (pixel(1, 0)) bits |= 0x02;
      if (pixel(2, 0)) bits |= 0x04;
      if (pixel(0, 1)) bits |= 0x08;
      if (pixel(1, 1)) bits |= 0x10;
      if (pixel(2, 1)) bits |= 0x20;
      if (pixel(3, 0)) bits |= 0x40;
      if (pixel(3, 1)) bits |= 0x80;
      rowStr += String.fromCharCode(0x2800 + bits);
    }
    brailleRows.push(rowStr);
  }

  return brailleRows.join('\n');
}

// ===== Jellyfish bitmap frames =====
// 12 cols × 12 rows each = 6 Braille cols × 3 Braille rows per frame.
// Bell stays still, tentacles drift left/right/back for the animation.

const JELLY_BITMAP_FRAMES: string[][] = [
  // Frame 0 — resting
  [
    '...######...',
    '..########..',
    '.##########.',
    '############',
    '############',
    '##.##..##.##',
    '.##########.',
    '..##.##.##..',
    '..#.#..#.#..',
    '..#.#..#.#..',
    '...#....#...',
    '...#....#...',
  ],
  // Frame 1 — tentacles drift left
  [
    '...######...',
    '..########..',
    '.##########.',
    '############',
    '############',
    '##.##..##.##',
    '.##########.',
    '.##.##.##...',
    '.#.#..#.#...',
    '.#.#..#.#...',
    '..#....#....',
    '..#....#....',
  ],
  // Frame 2 — tentacles drift right
  [
    '...######...',
    '..########..',
    '.##########.',
    '############',
    '############',
    '##.##..##.##',
    '.##########.',
    '...##.##.##.',
    '...#.#..#.#.',
    '...#.#..#.#.',
    '....#....#..',
    '....#....#..',
  ],
];

/**
 * Render the jellyfish mascot as Braille dot-matrix art. Returns one frame
 * per animation step. Colored cyan to stay on-brand.
 */
export function renderJellyfishFrames(): string[] {
  return JELLY_BITMAP_FRAMES.map((bitmap) => bitmapToBraille(bitmap));
}

function bitmapToBraille(bitmap: string[]): string {
  const rows = bitmap.length;
  const cols = bitmap[0]?.length ?? 0;
  const brailleRows: string[] = [];

  for (let by = 0; by < rows; by += 4) {
    let rowStr = '';
    for (let bx = 0; bx < cols; bx += 2) {
      const pixel = (dy: number, dx: number): boolean => {
        const y = by + dy;
        const x = bx + dx;
        if (y >= rows || x >= cols) return false;
        return bitmap[y][x] === '#';
      };
      let bits = 0;
      if (pixel(0, 0)) bits |= 0x01;
      if (pixel(1, 0)) bits |= 0x02;
      if (pixel(2, 0)) bits |= 0x04;
      if (pixel(0, 1)) bits |= 0x08;
      if (pixel(1, 1)) bits |= 0x10;
      if (pixel(2, 1)) bits |= 0x20;
      if (pixel(3, 0)) bits |= 0x40;
      if (pixel(3, 1)) bits |= 0x80;
      rowStr += String.fromCharCode(0x2800 + bits);
    }
    brailleRows.push(rowStr);
  }

  return brailleRows.join('\n');
}

// ===== Gradient helpers =====

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function lerpColor(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

/**
 * Apply a horizontal gradient across each line of the text. Gradient goes
 * left-to-right, restarting on each line.
 */
export function applyGradient(text: string, startHex: string, endHex: string): string {
  const c1 = hexToRgb(startHex);
  const c2 = hexToRgb(endHex);
  return text
    .split('\n')
    .map((line) => {
      const chars = [...line];
      let out = '';
      for (let i = 0; i < chars.length; i++) {
        const t = chars.length > 1 ? i / (chars.length - 1) : 0;
        const [r, g, b] = lerpColor(c1, c2, t);
        out += chalk.rgb(r, g, b)(chars[i]);
      }
      return out;
    })
    .join('\n');
}
