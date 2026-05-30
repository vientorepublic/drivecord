import * as dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable "${key}" is not set. Check your .env file.`);
  }
  return value;
}

export const config = {
  token: requireEnv('DISCORD_TOKEN'),
  channelId: requireEnv('DISCORD_CHANNEL_ID'),
  chunkSize: parseInt(process.env.CHUNK_SIZE ?? String(5 * 1024 * 1024), 10),
  uploadRetries: parseInt(process.env.UPLOAD_RETRIES ?? '3', 10),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS ?? '2000', 10),
} as const;
