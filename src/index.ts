import * as fs from 'fs';
import * as path from 'path';
import { Client, GatewayIntentBits } from 'discord.js';
import { SingleBar } from 'cli-progress';
import { config } from './config';
import { uploadFile } from './uploader';
import { downloadFile } from './downloader';
import {
  printBanner,
  printStep,
  printSuccess,
  printError,
  printWarn,
  printInfo,
  printDivider,
  createProgressBar,
} from './ui';
import type { UploadManifest } from './types';

// ─── CLI parsing ─────────────────────────────────────────────────────────────

const [, , command, ...args] = process.argv;

function printUsage(): void {
  console.log(`
Usage:
  upload   <file-path> [manifest-output-path]
  download <manifest-path>  [output-directory]

Examples:
  ts-node src/index.ts upload ./video.mp4
  ts-node src/index.ts upload ./video.mp4 ./manifest.json
  ts-node src/index.ts download ./manifest.json ./output
`);
}

// ─── Discord client ───────────────────────────────────────────────────────────

function createClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });
}

async function withReadyClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = createClient();

  return new Promise<T>((resolve, reject) => {
    client.once('clientReady', async () => {
      printSuccess(`Connected as ${client.user?.tag}`);
      try {
        const result = await fn(client);
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        client.destroy();
      }
    });

    client.login(config.token).catch(reject);
  });
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function handleUpload(filePath: string, manifestOut?: string): Promise<void> {
  if (!filePath) {
    printError('File path is required.');
    printUsage();
    process.exit(1);
  }

  printBanner('upload');
  printStep(`File  : ${path.resolve(filePath)}`);
  printInfo(`Chunk size: ${(config.chunkSize / 1024 / 1024).toFixed(1)} MB`);
  console.log();
  printStep('Connecting to Discord...');

  const state = { bar: null as SingleBar | null };

  const manifest = await withReadyClient((client) =>
    uploadFile(client, {
      filePath,
      onSplit: (total) => {
        printSuccess(`Split into ${total} chunk(s)`);
        printStep('Uploading chunks...');
        state.bar = createProgressBar();
        state.bar.start(total, 0);
      },
      onProgress: (done) => {
        state.bar?.update(done);
      },
      onRetry: (idx, attempt, maxRetries) => {
        process.stderr.write(`\n`);
        printWarn(`Chunk ${idx}: retry ${attempt + 1}/${maxRetries}`);
      },
    }),
  );

  state.bar?.stop();
  console.log();

  const outPath = manifestOut ?? `${path.basename(filePath)}.manifest.json`;
  await fs.promises.writeFile(outPath, JSON.stringify(manifest, null, 2), 'utf-8');

  printDivider();
  printSuccess('Upload complete!');
  printInfo(
    `File    : ${manifest.originalFilename} (${(manifest.originalSize / 1024 / 1024).toFixed(2)} MB)`,
  );
  printInfo(`Chunks  : ${manifest.totalChunks}`);
  printInfo(`Hash    : ${manifest.originalHash}`);
  printInfo(`Manifest: ${outPath}`);
  console.log();
}

async function handleDownload(manifestPath: string, outputDir?: string): Promise<void> {
  if (!manifestPath) {
    printError('Manifest path is required.');
    printUsage();
    process.exit(1);
  }

  const raw = await fs.promises.readFile(path.resolve(manifestPath), 'utf-8');
  const manifest: UploadManifest = JSON.parse(raw) as UploadManifest;

  printBanner('download');
  printStep(`File  : ${manifest.originalFilename}`);
  printInfo(`Size  : ${(manifest.originalSize / 1024 / 1024).toFixed(2)} MB`);
  printInfo(`Chunks: ${manifest.totalChunks}`);
  console.log();
  printStep('Connecting to Discord...');

  const bar = createProgressBar();

  const savedPath = await withReadyClient((client) => {
    bar.start(manifest.totalChunks, 0);
    return downloadFile(client, manifest, {
      manifestPath,
      outputDir,
      onProgress: (done) => {
        bar.update(done);
      },
    });
  });

  bar.stop();
  console.log();

  printStep('Verifying integrity...');
  printDivider();
  printSuccess('Download complete!');
  printInfo(`Saved → ${savedPath}`);
  console.log();
}

// ─── Entry point ─────────────────────────────────────────────────────────────

(async () => {
  switch (command) {
    case 'upload':
      await handleUpload(args[0], args[1]);
      break;

    case 'download':
      await handleDownload(args[0], args[1]);
      break;

    default:
      printUsage();
      process.exit(command ? 1 : 0);
  }
})().catch((err: unknown) => {
  console.log();
  printError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
