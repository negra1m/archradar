// Welcome screen — shown when the user runs `archradar` with no arguments.
// Renders a big block ARCHRADAR logo with a gradient (cfonts) and an animated
// jellyfish mascot bobbing next to a "Did you know?" tip box.

import chalk from 'chalk';
import readline from 'readline';
import { textToBraille, applyGradient, renderJellyfishFrames } from './brailleText.js';

export interface WelcomeUser {
  username: string;
  email: string | null;
}

// Jellyfish frames rendered as Braille dot-matrix art (matches header style).
// Braille is 3 rows tall; we pad top and bottom so it vertically centers
// next to the 7-row tip box.
const JELLY_WIDTH = 6; // Braille chars wide (12 pixels / 2)
const JELLY_PAD = ' '.repeat(JELLY_WIDTH);
const JELLY_FRAMES: string[][] = renderJellyfishFrames().map((frame) => {
  const lines = frame.split('\n');
  return [JELLY_PAD, JELLY_PAD, ...lines, JELLY_PAD, JELLY_PAD];
});

const TIP_WIDTH = 50;
const ANIMATION_FRAMES = 12;
const FRAME_DELAY_MS = 220;

// ===== Tip box =====

// Measure the visible width of a string, ignoring ANSI escape sequences.
// Needed because chalk wraps content with escape codes that inflate .length
// without adding visible columns.
function visualWidth(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function padEndVisual(s: string, width: number): string {
  const vw = visualWidth(s);
  if (vw >= width) return s;
  return s + ' '.repeat(width - vw);
}

function buildTipBox(lines: string[]): string[] {
  // Layout: ╭─── Did you know? ─...─╮   (TIP_WIDTH total cols)
  //   ╭ + ─── + ' ' + title + ' ' + dashes + ╮
  //   1 + 3   + 1   + 13    + 1   + ??      + 1  = TIP_WIDTH
  //   ⇒ dashes = TIP_WIDTH - 20
  const titleChunk = '╭─── ' + chalk.yellow('Did you know?') + ' ';
  const top = titleChunk + '─'.repeat(TIP_WIDTH - 20) + '╮';
  const bottom = '╰' + '─'.repeat(TIP_WIDTH - 2) + '╯';
  const middle = lines.map((line) => {
    const padded = padEndVisual(line, TIP_WIDTH - 4);
    return '│ ' + padded + ' │';
  });
  return [top, ...middle, bottom];
}

// ===== Header =====

function renderHeader(): string {
  const braille = textToBraille('ARCHRADAR');
  // Cyan (#00d4ff) → Magenta (#ff00ff) gradient, matching the pricing banner vibe.
  return applyGradient(braille, '#00d4ff', '#ff00ff');
}

// ===== Render a combined frame (tip box + jellyfish side by side) =====

function combineRow(left: string, right: string, leftWidth: number): string {
  const padded = left.padEnd(leftWidth, ' ');
  return padded + '   ' + right;
}

function renderFrame(tipBoxLines: string[], jellyLines: string[]): string {
  const maxRows = Math.max(tipBoxLines.length, jellyLines.length);
  const rows: string[] = [];
  for (let i = 0; i < maxRows; i++) {
    const left = tipBoxLines[i] ?? ' '.repeat(TIP_WIDTH);
    const right = jellyLines[i] ?? ' '.repeat(JELLY_WIDTH);
    rows.push(combineRow(left, chalk.cyan(right), TIP_WIDTH));
  }
  return rows.join('\n');
}

// ===== Public entry point =====

export async function printWelcome(user: WelcomeUser | null): Promise<void> {
  // 1. Render the header once, printed statically.
  console.log('');
  console.log(renderHeader());

  // 2. Build the tip box content based on auth state.
  // Both branches use 5 content rows (blank, 3 content, blank) so the
  // card height matches the jellyfish region exactly.
  const tipLines = user
    ? [
        '',
        `  ${chalk.green('✓')} Welcome back, ${chalk.cyan('@' + user.username)}`,
        '  Run ' + chalk.cyan('archradar scan') + ' for a quick report.',
        '  Run ' + chalk.cyan('archradar audit') + ' for the full report.',
        '',
      ]
    : [
        '',
        `  ${chalk.yellow('◆')} You're browsing as guest.`,
        '  Sign in to unlock audits and trends.',
        '  Run ' + chalk.cyan('archradar login') + ' to connect GitHub.',
        '',
      ];
  const tipBox = buildTipBox(tipLines);
  const totalRows = Math.max(tipBox.length, JELLY_FRAMES[0].length);

  // 3. Animate the jellyfish by redrawing the whole region each frame.
  //    On non-TTY (piped output), skip the animation and just print once.
  const isTty = Boolean(process.stdout.isTTY);

  if (!isTty) {
    process.stdout.write(renderFrame(tipBox, JELLY_FRAMES[0]) + '\n');
  } else {
    // Print the first frame and remember its height
    process.stdout.write(renderFrame(tipBox, JELLY_FRAMES[0]) + '\n');

    for (let i = 1; i < ANIMATION_FRAMES; i++) {
      await new Promise((r) => setTimeout(r, FRAME_DELAY_MS));

      // Move cursor up to the start of the frame region
      readline.moveCursor(process.stdout, 0, -totalRows);
      readline.cursorTo(process.stdout, 0);
      readline.clearScreenDown(process.stdout);

      const frame = JELLY_FRAMES[i % JELLY_FRAMES.length];
      process.stdout.write(renderFrame(tipBox, frame) + '\n');
    }
  }

  // 4. Print the commands list below (static).
  console.log('');
  console.log(chalk.bold('  COMMANDS'));
  console.log('');
  console.log(`  ${chalk.cyan('archradar scan [path]')}  ${chalk.dim('Analyze a project architecture')}`);
  console.log(`  ${chalk.cyan('archradar login')}        ${chalk.dim('Sign in with GitHub to unlock premium')}`);
  console.log(`  ${chalk.cyan('archradar whoami')}       ${chalk.dim('Show the current signed-in user')}`);
  console.log(`  ${chalk.cyan('archradar logout')}       ${chalk.dim('Sign out and disable premium')}`);
  console.log('');
}
