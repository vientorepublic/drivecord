import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Chunk } from './types';

/**
 * 파일을 읽어 지정된 크기의 Buffer 청크 배열로 분할합니다.
 *
 * @param filePath  분할할 파일 경로
 * @param chunkSize 청크 하나의 최대 크기 (bytes)
 * @returns         순서대로 정렬된 Chunk 배열
 */
export async function splitFile(filePath: string, chunkSize: number): Promise<Chunk[]> {
  if (chunkSize <= 0) {
    throw new RangeError(`chunkSize must be a positive number. Received: ${chunkSize}`);
  }

  const absolutePath = path.resolve(filePath);
  const stat = await fs.promises.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${absolutePath}`);
  }

  const fileSize = stat.size;
  if (fileSize === 0) {
    throw new Error('Cannot split an empty file.');
  }

  const totalChunks = Math.ceil(fileSize / chunkSize);
  const fileHandle = await fs.promises.open(absolutePath, 'r');

  const chunks: Chunk[] = [];

  try {
    for (let i = 0; i < totalChunks; i++) {
      const offset = i * chunkSize;
      const length = Math.min(chunkSize, fileSize - offset);
      const buffer = Buffer.allocUnsafe(length);

      await fileHandle.read(buffer, 0, length, offset);

      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      chunks.push({ index: i, data: buffer, hash });
    }
  } finally {
    await fileHandle.close();
  }

  return chunks;
}

/**
 * 원본 파일 전체의 SHA-256 해시를 계산합니다.
 * 매니페스트의 originalHash 필드에 사용됩니다.
 */
export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(path.resolve(filePath));
    stream.on('data', (chunk) => hash.update(chunk as Buffer));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 청크 파일명을 생성합니다.
 * 예) "video.mp4" + index 3 + totalChunks 12  →  "video.mp4.chunk.003"
 */
export function buildChunkFilename(
  originalFilename: string,
  index: number,
  totalChunks: number,
): string {
  const digits = String(totalChunks - 1).length;
  const paddedIndex = String(index).padStart(digits, '0');
  return `${originalFilename}.chunk.${paddedIndex}`;
}
