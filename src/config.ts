import * as dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable "${key}" is not set. Check your .env file.`);
  }
  return value;
}

const DISCORD_MAX_ATTACHMENT = 25 * 1024 * 1024; // 25 MB
const rawChunkSize = parseInt(process.env.CHUNK_SIZE ?? String(5 * 1024 * 1024), 10);
if (!Number.isFinite(rawChunkSize) || rawChunkSize <= 0) {
  throw new Error('CHUNK_SIZE must be a positive integer.');
}
if (rawChunkSize > DISCORD_MAX_ATTACHMENT) {
  throw new Error(
    `CHUNK_SIZE (${(rawChunkSize / 1024 / 1024).toFixed(1)} MB) exceeds Discord's 25 MB attachment limit.`,
  );
}

export const config = {
  token: requireEnv('DISCORD_TOKEN'),
  channelId: requireEnv('DISCORD_CHANNEL_ID'),
  chunkSize: rawChunkSize,
  uploadRetries: parseInt(process.env.UPLOAD_RETRIES ?? '3', 10),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS ?? '2000', 10),
  debug: process.env.DEBUG === 'true',
} as const;
