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
  /** Discord Bot Token */
  token: requireEnv('DISCORD_TOKEN'),

  /** 청크를 업로드할 기본 채널 ID */
  channelId: requireEnv('DISCORD_CHANNEL_ID'),

  /**
   * 청크 하나의 최대 크기 (bytes)
   * Discord 무료 서버 첨부파일 한도: 25 MB (명목)
   * 멀티파트 오버헤드를 제외하면 실효 한도가 낮아지므로 기본값 5 MB 사용
   */
  chunkSize: parseInt(process.env.CHUNK_SIZE ?? String(5 * 1024 * 1024), 10),

  /** 업로드 재시도 횟수 */
  uploadRetries: parseInt(process.env.UPLOAD_RETRIES ?? '3', 10),

  /** 재시도 사이 대기 시간 (ms) */
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS ?? '2000', 10),
} as const;
