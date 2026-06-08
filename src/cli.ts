import type { LoggerService } from '@nestjs/common';

// ── ANSI colour palette ───────────────────────────────────────────────────────

export const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  purple: '\x1b[38;5;135m',
  violet: '\x1b[38;5;99m',
  magenta: '\x1b[38;5;213m',
  white: '\x1b[97m',
  gray: '\x1b[38;5;245m',
  cyan: '\x1b[38;5;117m',
  yellow: '\x1b[38;5;221m',
  red: '\x1b[38;5;203m',
} as const;

// ── Custom NestJS logger ──────────────────────────────────────────────────────

export class DriveCordLogger implements LoggerService {
  constructor(private readonly debugEnabled = false) {}

  private static fmt(
    level: string,
    levelColor: string,
    message: unknown,
    context?: unknown,
  ): string {
    const ts = new Date().toTimeString().slice(0, 8);
    const ctx =
      typeof context === 'string' && context ? `${C.dim}${C.violet}${context}${C.reset}  ` : '';
    const msg = typeof message === 'string' ? message : String(message);
    const badge = `${levelColor}${C.bold}${level.padEnd(5)}${C.reset}`;
    return `  ${C.gray}${C.dim}${ts}${C.reset}  ${badge}  ${ctx}${msg}`;
  }

  log(message: unknown, context?: unknown): void {
    process.stdout.write(DriveCordLogger.fmt('LOG', C.cyan, message, context) + '\n');
  }

  warn(message: unknown, context?: unknown): void {
    process.stdout.write(DriveCordLogger.fmt('WARN', C.yellow, message, context) + '\n');
  }

  error(message: unknown, trace?: unknown, context?: unknown): void {
    process.stderr.write(DriveCordLogger.fmt('ERROR', C.red, message, context) + '\n');
    if (typeof trace === 'string' && trace) {
      process.stderr.write(
        trace
          .split('\n')
          .map((l) => `        ${C.dim}${l}${C.reset}`)
          .join('\n') + '\n',
      );
    }
  }

  debug(message: unknown, context?: unknown): void {
    if (!this.debugEnabled) return;
    process.stdout.write(DriveCordLogger.fmt('DEBUG', C.gray, message, context) + '\n');
  }

  verbose(message: unknown, context?: unknown): void {
    if (!this.debugEnabled) return;
    process.stdout.write(DriveCordLogger.fmt('VERB', C.magenta, message, context) + '\n');
  }

  fatal(message: unknown, context?: unknown): void {
    process.stderr.write(DriveCordLogger.fmt('FATAL', C.red, message, context) + '\n');
  }
}

// ── Gradient helpers ──────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function gradientLine(text: string, stops: [number, number, number][]): string {
  const len = text.length;
  if (len === 0) return '';
  const n = stops.length - 1;
  let out = '';
  for (let i = 0; i < len; i++) {
    const t = len > 1 ? i / (len - 1) : 0;
    const seg = Math.min(Math.floor(t * n), n - 1);
    const [r, g, b] = lerpColor(stops[seg], stops[seg + 1] ?? stops[seg], t * n - seg);
    out += `\x1b[1;38;2;${r};${g};${b}m${text[i]}`;
  }
  return out + C.reset;
}

// ── Startup banner ────────────────────────────────────────────────────────────

export function printBanner(): void {
  const m = C.magenta;
  const r = C.reset;

  // Colour stops: vivid magenta-pink → purple → medium violet → deep indigo
  const stops: [number, number, number][] = [
    [255, 75, 220],
    [210, 65, 255],
    [140, 55, 255],
    [75, 40, 255],
  ];

  const driveLines = [
    '██████╗ ██████╗ ██╗██╗   ██╗███████╗',
    '██╔══██╗██╔══██╗██║██║   ██║██╔════╝',
    '██║  ██║██████╔╝██║██║   ██║█████╗  ',
    '██║  ██║██╔══██╗██║╚██╗ ██╔╝██╔══╝  ',
    '██████╔╝██║  ██║██║ ╚████╔╝ ███████╗',
    '╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝  ╚══════╝',
  ];

  const cordLines = [
    ' ██████╗  ██████╗ ██████╗ ██████╗ ',
    '██╔════╝ ██╔═══██╗██╔══██╗██╔══██╗',
    '██║      ██║   ██║██████╔╝██║  ██║',
    '██║      ██║   ██║██╔══██╗██║  ██║',
    '╚██████╗ ╚██████╔╝██║  ██║██████╔╝',
    ' ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ',
  ];

  const lines = [
    '',
    ...driveLines.map((d, i) => gradientLine(d + cordLines[i], stops)),
    '',
    `${C.gray}  ${C.dim}${'─'.repeat(63)}${r}`,
    `${C.white}  ${C.bold}Discord as File Storage${r}  ${m}· split · store · retrieve${r}`,
    `${C.gray}  ${C.dim}${'─'.repeat(63)}${r}`,
    '',
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

export function printReady(port: number, debug = false): void {
  const url = `http://localhost:${port}`;
  const debugBadge = debug
    ? `  ${C.yellow}${C.bold}DEBUG${C.reset}${C.yellow} mode — verbose logging enabled${C.reset}`
    : '';
  process.stdout.write(
    `  ${C.cyan}${C.bold}Ready${C.reset}  →  ${C.white}${url}${C.reset}${debugBadge}\n\n`,
  );
}
