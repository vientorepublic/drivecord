export interface ChunkRecord {
  index: number;
  messageId: string;
  filename: string;
  size: number;
  hash: string;
}

export interface UploadManifest {
  version: 1;
  originalFilename: string;
  originalSize: number;
  chunkSize: number;
  totalChunks: number;
  originalHash: string;
  channelId: string;
  uploadedAt: string;
  chunks: ChunkRecord[];
}

export interface Chunk {
  index: number;
  data: Buffer;
  hash: string;
}

export interface UploadOptions {
  filePath: string;
  channelId?: string;
  chunkSize?: number;
  manifestOut?: string;
  onSplit?: (totalChunks: number) => void;
  onProgress?: (done: number, total: number) => void;
  onRetry?: (chunkIndex: number, attempt: number, maxRetries: number) => void;
}

export interface DownloadOptions {
  manifestPath: string;
  outputDir?: string;
  onProgress?: (done: number, total: number) => void;
}
