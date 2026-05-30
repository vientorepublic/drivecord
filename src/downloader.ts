import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { TextChannel, type Client } from 'discord.js';
import { mergeChunks, verifyMergedFile, validateChunkHashes } from './merger';
import type { DownloadOptions, UploadManifest } from './types';

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} - ${url}`));
          return;
        }
        const parts: Buffer[] = [];
        res.on('data', (chunk: Buffer) => parts.push(chunk));
        res.on('end', () => resolve(Buffer.concat(parts)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

export async function downloadChunks(
  client: Client,
  manifest: UploadManifest,
  onProgress?: (done: number, total: number) => void,
): Promise<Buffer[]> {
  const channel = await client.channels.fetch(manifest.channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel ${manifest.channelId} not found or is not a text channel.`);
  }

  const sortedChunks = [...manifest.chunks].sort((a, b) => a.index - b.index);
  const buffers: Buffer[] = new Array(manifest.totalChunks);

  for (const record of sortedChunks) {
    const message = await channel.messages.fetch(record.messageId);
    const attachment = message.attachments.find((a) => a.name === record.filename);

    if (!attachment) {
      throw new Error(`Attachment "${record.filename}" not found in message ${record.messageId}.`);
    }

    const buffer = await fetchBuffer(attachment.url);
    buffers[record.index] = buffer;
    onProgress?.(record.index + 1, manifest.totalChunks);
  }

  return buffers;
}

export async function downloadFile(
  client: Client,
  manifest: UploadManifest,
  options: DownloadOptions,
): Promise<string> {
  const outputDir = path.resolve(options.outputDir ?? '.');
  const outputPath = path.join(outputDir, manifest.originalFilename);

  const buffers = await downloadChunks(client, manifest, options.onProgress);

  const corrupted = validateChunkHashes(buffers, manifest);
  if (corrupted.length > 0) {
    throw new Error(`Chunk hash mismatch at indices: [${corrupted.join(', ')}]`);
  }

  await mergeChunks(buffers, outputPath);

  const isValid = await verifyMergedFile(outputPath, manifest);
  if (!isValid) {
    throw new Error('Merged file SHA-256 does not match the original. The file may be corrupted.');
  }

  return outputPath;
}
