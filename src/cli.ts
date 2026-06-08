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

// ── Startup banner ────────────────────────────────────────────────────────────

export function printBanner(): void {
  const p = C.purple + C.bold;
  const v = C.violet + C.bold;
  const m = C.magenta;
  const r = C.reset;
  const lines = [
    '',
    `${p}██████╗ ██████╗ ██╗██╗   ██╗███████╗${r}${v} ██████╗  ██████╗ ██████╗ ██████╗ ${r}`,
    `${p}██╔══██╗██╔══██╗██║██║   ██║██╔════╝${r}${v}██╔════╝ ██╔═══██╗██╔══██╗██╔══██╗${r}`,
    `${p}██║  ██║██████╔╝██║██║   ██║█████╗  ${r}${v}██║      ██║   ██║██████╔╝██║  ██║${r}`,
    `${p}██║  ██║██╔══██╗██║╚██╗ ██╔╝██╔══╝  ${r}${v}██║      ██║   ██║██╔══██╗██║  ██║${r}`,
    `${p}██████╔╝██║  ██║██║ ╚████╔╝ ███████╗${r}${v}╚██████╗ ╚██████╔╝██║  ██║██████╔╝${r}`,
    `${p}╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝  ╚══════╝${r}${v} ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ${r}`,
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
