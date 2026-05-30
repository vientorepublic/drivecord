import { SingleBar, Presets } from 'cli-progress';

// ANSI escape codes (no extra dependency)
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgBlue: '\x1b[44m',
} as const;

export function printBanner(command: 'upload' | 'download'): void {
  const action = command === 'upload' ? '\u2191  UPLOAD' : '\u2193  DOWNLOAD';
  console.log();
  console.log(`${C.bold}${C.bgBlue}  drivecord  ${C.reset}  ${C.cyan}${action}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(52)}${C.reset}`);
  console.log();
}

export function printStep(msg: string): void {
  console.log(`${C.bold}${C.blue}\u25B6${C.reset}  ${msg}`);
}

export function printSuccess(msg: string): void {
  console.log(`${C.green}\u2714${C.reset}  ${msg}`);
}

export function printWarn(msg: string): void {
  console.warn(`${C.yellow}\u26A0${C.reset}  ${msg}`);
}

export function printError(msg: string): void {
  console.error(`${C.red}\u2716${C.reset}  ${msg}`);
}

export function printInfo(msg: string): void {
  console.log(`${C.dim}   ${msg}${C.reset}`);
}

export function printDivider(): void {
  console.log(`${C.dim}${'─'.repeat(52)}${C.reset}`);
}

export function createProgressBar(): SingleBar {
  return new SingleBar(
    {
      format: `   ${C.cyan}{bar}${C.reset}  {percentage}%  [{value}/{total} chunks]  ETA: {eta}s`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      barsize: 32,
      hideCursor: true,
      clearOnComplete: false,
    },
    Presets.shades_classic,
  );
}
