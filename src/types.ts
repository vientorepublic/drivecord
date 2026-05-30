/** Discord 채널에 업로드된 각 청크 하나의 정보 */
export interface ChunkRecord {
  index: number;
  messageId: string;
  filename: string; // 첨부파일명
  size: number; // 바이트 단위 청크 크기
  hash: string; // SHA-256 hex - 무결성 검증용
}

/** 업로드 완료 후 생성되는 매니페스트 (JSON으로 저장/공유) */
export interface UploadManifest {
  version: 1;
  originalFilename: string;
  originalSize: number; // 원본 파일 전체 크기 (bytes)
  chunkSize: number; // 각 청크의 최대 크기 (bytes)
  totalChunks: number;
  originalHash: string; // 원본 파일 전체 SHA-256 - 최종 검증용
  channelId: string;
  uploadedAt: string; // ISO 8601
  chunks: ChunkRecord[];
}

/** splitFile() 의 반환 단위 */
export interface Chunk {
  index: number;
  data: Buffer;
  hash: string; // SHA-256 of this chunk's data
}

/** CLI options */
export interface UploadOptions {
  filePath: string;
  channelId?: string;
  chunkSize?: number;
  /** Path to save the manifest JSON */
  manifestOut?: string;
  /** Called once after splitting, with the total chunk count */
  onSplit?: (totalChunks: number) => void;
  /** Called after each chunk is uploaded */
  onProgress?: (done: number, total: number) => void;
  /** Called when a chunk upload is retried */
  onRetry?: (chunkIndex: number, attempt: number, maxRetries: number) => void;
}

export interface DownloadOptions {
  manifestPath: string;
  outputDir?: string;
  /** Called after each chunk is downloaded */
  onProgress?: (done: number, total: number) => void;
}
