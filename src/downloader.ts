import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import { TextChannel, type Client } from 'discord.js';
import type { DownloadOptions, UploadManifest } from './types';

/**
 * Fetch a remote URL into a Buffer.
 * Respects AbortSignal: destroys the underlying socket and rejects with AbortError.
 */
function fetchBuffer(url: string, signal?: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} - ${url}`));
        return;
      }
      const parts: Buffer[] = [];
      res.on('data', (chunk: Buffer) => parts.push(chunk));
      res.on('end', () => resolve(Buffer.concat(parts)));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (signal) {
      const onAbort = (): void => {
        req.destroy();
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Download a file from Discord, streaming each chunk directly to disk.
 * Validates per-chunk SHA-256 hashes and the overall file hash inline —
 * no Buffer[] accumulation, no separate verification passes, no readFileSync.
 */
export async function downloadFile(
  client: Client,
  manifest: UploadManifest,
  options: DownloadOptions,
): Promise<string> {
  const outputDir = path.resolve(options.outputDir ?? '.');
  const outputPath = path.join(outputDir, manifest.originalFilename);

  options.onConnect?.();
  const channel = await client.channels.fetch(manifest.channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel ${manifest.channelId} not found or is not a text channel.`);
  }

  const sortedChunks = [...manifest.chunks].sort((a, b) => a.index - b.index);

  await fs.promises.mkdir(outputDir, { recursive: true });
  const fileHandle = await fs.promises.open(outputPath, 'w');
  const overallHasher = crypto.createHash('sha256');

  try {
    for (const record of sortedChunks) {
      options.signal?.throwIfAborted();

      const message = await channel.messages.fetch(record.messageId);
      const attachment = message.attachments.find((a) => a.name === record.filename);
      if (!attachment) {
        throw new Error(
          `Attachment "${record.filename}" not found in message ${record.messageId}.`,
        );
      }

      const buffer = await fetchBuffer(attachment.url, options.signal);

      const chunkHash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (chunkHash !== record.hash) {
        throw new Error(`Chunk ${record.index} hash mismatch`);
      }

      await fileHandle.write(buffer);
      overallHasher.update(buffer);
      options.onProgress?.(record.index + 1, manifest.totalChunks);
    }
  } finally {
    await fileHandle.close();
  }

  const finalHash = overallHasher.digest('hex');
  if (finalHash !== manifest.originalHash) {
    await fs.promises.unlink(outputPath).catch(() => {});
    throw new Error('Merged file SHA-256 does not match the original. The file may be corrupted.');
  }

  return outputPath;
}
