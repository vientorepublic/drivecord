import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { UploadManifest } from './types';

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
