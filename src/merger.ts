import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { UploadManifest } from './types';

/**
 * Buffer 배열을 순서대로 이어 붙여 단일 파일로 저장합니다.
 *
 * @param chunks    순서대로 정렬된 Buffer 배열 (index 0부터)
 * @param outputPath 저장할 파일 경로
 */
export async function mergeChunks(chunks: Buffer[], outputPath: string): Promise<void> {
  if (chunks.length === 0) {
    throw new Error('No chunks to merge.');
  }

  const absolutePath = path.resolve(outputPath);
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });

  const fileHandle = await fs.promises.open(absolutePath, 'w');
  try {
    for (const chunk of chunks) {
      await fileHandle.write(chunk);
    }
  } finally {
    await fileHandle.close();
  }
}

/**
 * 병합된 파일의 SHA-256 해시를 계산하고 매니페스트의 originalHash 와 비교합니다.
 *
 * @returns 해시가 일치하면 true, 불일치하면 false
 */
export async function verifyMergedFile(
  filePath: string,
  manifest: UploadManifest,
): Promise<boolean> {
  const hash = await new Promise<string>((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const stream = fs.createReadStream(path.resolve(filePath));
    stream.on('data', (chunk) => h.update(chunk as Buffer));
    stream.on('end', () => resolve(h.digest('hex')));
    stream.on('error', reject);
  });

  return hash === manifest.originalHash;
}

/**
 * 각 청크 Buffer의 SHA-256 해시가 매니페스트에 기록된 값과 일치하는지 검증합니다.
 * 불일치하는 청크의 인덱스 배열을 반환합니다 (모두 일치하면 빈 배열).
 */
export function validateChunkHashes(chunks: Buffer[], manifest: UploadManifest): number[] {
  const corrupted: number[] = [];

  for (const record of manifest.chunks) {
    const buf = chunks[record.index];
    if (!buf) {
      corrupted.push(record.index);
      continue;
    }
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hash !== record.hash) {
      corrupted.push(record.index);
    }
  }

  return corrupted;
}
