import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { AttachmentBuilder, TextChannel, type Client } from 'discord.js';
import { buildChunkFilename } from './chunker';
import { config } from './config';
import type { Chunk, ChunkRecord, UploadManifest, UploadOptions } from './types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Max chunks uploaded concurrently per batch (keeps ≤ CONCURRENCY × chunkSize in RAM). */
const UPLOAD_CONCURRENCY = 3;

/**
 * Delete Discord messages in batches to stay within the per-channel rate limit
 * (Discord allows ~5 delete requests per second per channel).
 * Ignores individual failures so a missing message never aborts the whole cleanup.
 */
export async function deleteMessagesThrottled(
  channel: TextChannel,
  messageIds: string[],
  batchSize = 5,
  delayMs = 1100,
): Promise<void> {
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    await Promise.allSettled(batch.map((id) => channel.messages.delete(id)));
    if (i + batchSize < messageIds.length) await sleep(delayMs);
  }
}

async function uploadChunkWithRetry(
  channel: TextChannel,
  chunk: Chunk,
  chunkFilename: string,
  retries: number,
  delayMs: number,
  onRetry?: (chunkIndex: number, attempt: number, maxRetries: number) => void,
  signal?: AbortSignal,
): Promise<ChunkRecord> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    signal?.throwIfAborted();
    try {
      const attachment = new AttachmentBuilder(chunk.data, { name: chunkFilename });
      const message = await channel.send({
        content: `chunk:${chunk.index}`,
        files: [attachment],
      });

      const uploaded = message.attachments.first();
      if (!uploaded) {
        throw new Error(`No attachment found in message ${message.id}`);
      }

      return {
        index: chunk.index,
        messageId: message.id,
        filename: chunkFilename,
        size: chunk.data.length,
        hash: chunk.hash,
      };
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < retries) {
        onRetry?.(chunk.index, attempt, retries);
        await sleep(delayMs);
      }
    }
  }

  throw new Error(
    `Chunk ${chunk.index} upload failed after ${retries + 1} attempts: ${String(lastError)}`,
  );
}

export async function uploadFile(client: Client, options: UploadOptions): Promise<UploadManifest> {
  const channelId = options.channelId ?? config.channelId;
  const chunkSize = options.chunkSize ?? config.chunkSize;
  const filePath = path.resolve(options.filePath);
  const originalFilename = path.basename(filePath);

  options.onConnect?.();
  const channel = await client.channels.fetch(channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel ${channelId} not found or is not a text channel.`);
  }

  // Use fs.stat for size — avoids loading the file into RAM to count bytes.
  const stat = await fs.promises.stat(filePath);
  const originalSize = stat.size;
  const totalChunks = Math.ceil(originalSize / chunkSize);

  options.onSplit?.(totalChunks);

  const overallHasher = crypto.createHash('sha256');
  const completedRecords: ChunkRecord[] = [];

  // Open the file once; read each batch of CONCURRENCY chunks directly from disk.
  const fileHandle = await fs.promises.open(filePath, 'r');
  try {
    for (let batchStart = 0; batchStart < totalChunks; batchStart += UPLOAD_CONCURRENCY) {
      options.signal?.throwIfAborted();

      const batchSize = Math.min(UPLOAD_CONCURRENCY, totalChunks - batchStart);
      const batchChunks: Chunk[] = [];

      // Read next batch from disk (sequential, in-order for correct hash accumulation).
      for (let j = 0; j < batchSize; j++) {
        const i = batchStart + j;
        const offset = i * chunkSize;
        const length = Math.min(chunkSize, originalSize - offset);
        const buffer = Buffer.allocUnsafe(length);
        await fileHandle.read(buffer, 0, length, offset);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        overallHasher.update(buffer);
        batchChunks.push({ index: i, data: buffer, hash });
      }

      // Upload batch concurrently; allSettled ensures we capture every completed record
      // even when one task fails — critical for correct rollback on abort.
      // Each chunk calls onProgress immediately on completion to avoid batch-level SSE delay.
      const batchResults = await Promise.allSettled(
        batchChunks.map((chunk) => {
          const chunkFilename = buildChunkFilename(originalFilename, chunk.index, totalChunks);
          return uploadChunkWithRetry(
            channel,
            chunk,
            chunkFilename,
            config.uploadRetries,
            config.retryDelayMs,
            options.onRetry,
            options.signal,
          ).then((record) => {
            completedRecords.push(record);
            options.onProgress?.(completedRecords.length, totalChunks);
            return record;
          });
        }),
      );

      let batchError: unknown = null;
      for (const result of batchResults) {
        if (result.status === 'rejected' && !batchError) {
          batchError = result.reason;
        }
      }
      if (batchError) throw batchError;
    }
    // Final abort check after the last batch completes: channel.send() calls inside the
    // last batch are not cancellable once started, so the loop may finish normally even
    // though the signal was aborted during the last batch's network I/O.
    options.signal?.throwIfAborted();
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError' && completedRecords.length > 0) {
      await Promise.allSettled(completedRecords.map((r) => channel.messages.delete(r.messageId)));
    }
    throw err;
  } finally {
    await fileHandle.close();
  }

  const originalHash = overallHasher.digest('hex');
  completedRecords.sort((a, b) => a.index - b.index);

  const manifest: UploadManifest = {
    version: 1,
    originalFilename,
    originalSize,
    chunkSize,
    totalChunks,
    originalHash,
    channelId,
    uploadedAt: new Date().toISOString(),
    chunks: completedRecords,
  };

  return manifest;
}
