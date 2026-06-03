import { Entity, PrimaryColumn, Column } from 'typeorm';
import type { ChunkRecord } from '../types';

@Entity('file_manifests')
export class FileManifestEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column('integer', { default: 1 })
  version!: 1;

  @Column('text')
  originalFilename!: string;

  @Column('integer')
  originalSize!: number;

  @Column('integer')
  chunkSize!: number;

  @Column('integer')
  totalChunks!: number;

  @Column('text')
  originalHash!: string;

  @Column('text')
  channelId!: string;

  @Column('text')
  uploadedAt!: string;

  /** Stored as JSON text in SQLite */
  @Column({ type: 'simple-json' })
  chunks!: ChunkRecord[];
}
