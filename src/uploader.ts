import * as path from 'path';
import { AttachmentBuilder, TextChannel, type Client } from 'discord.js';
import { splitFile, hashFile, buildChunkFilename } from './chunker';
import { config } from './config';
import type { Chunk, ChunkRecord, UploadManifest, UploadOptions } from './types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

  const channel = await client.channels.fetch(channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel ${channelId} not found or is not a text channel.`);
  }

  const chunks = await splitFile(filePath, chunkSize);
  const totalChunks = chunks.length;

  options.onSplit?.(totalChunks);

  const originalHash = await hashFile(filePath);
  const originalSize = chunks.reduce((sum, c) => sum + c.data.length, 0);

  const chunkRecords: ChunkRecord[] = [];

  try {
    for (const chunk of chunks) {
      options.signal?.throwIfAborted();
      const chunkFilename = buildChunkFilename(originalFilename, chunk.index, totalChunks);

      const record = await uploadChunkWithRetry(
        channel,
        chunk,
        chunkFilename,
        config.uploadRetries,
        config.retryDelayMs,
        options.onRetry,
        options.signal,
      );
      chunkRecords.push(record);
      options.onProgress?.(chunkRecords.length, totalChunks);
    }
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError' && chunkRecords.length > 0) {
      await Promise.allSettled(chunkRecords.map((r) => channel.messages.delete(r.messageId)));
    }
    throw err;
  }

  const manifest: UploadManifest = {
    version: 1,
    originalFilename,
    originalSize,
    chunkSize,
    totalChunks,
    originalHash,
    channelId,
    uploadedAt: new Date().toISOString(),
    chunks: chunkRecords,
  };

  return manifest;
}
