import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uploadFile } from '../uploader';
import { downloadFile } from '../downloader';
import { DiscordService } from '../discord/discord.service';
import { FileManifestEntity } from '../database/file-manifest.entity';

interface DownloadJob {
  buffer: Buffer;
  filename: string;
}

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);
  private readonly downloadJobs = new Map<string, DownloadJob>();

  constructor(
    private readonly discord: DiscordService,
    @InjectRepository(FileManifestEntity)
    private readonly repo: Repository<FileManifestEntity>,
  ) {}

  /** 기존 manifests.json이 있으면 DB로 이관 후 .migrated로 이름 변경 */
  async onModuleInit(): Promise<void> {
    const jsonPath = path.join(process.cwd(), 'data', 'manifests.json');
    if (!fs.existsSync(jsonPath)) return;

    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const entries: FileManifestEntity[] = JSON.parse(raw);
      if (Array.isArray(entries) && entries.length > 0) {
        await this.repo.save(entries);
        this.logger.log(`manifests.json → DB: ${entries.length}개 항목 마이그레이션 완료`);
      }
      fs.renameSync(jsonPath, jsonPath + '.migrated');
    } catch (err) {
      this.logger.warn('manifests.json 마이그레이션 실패: ' + String(err));
    }
  }

  async list(): Promise<FileManifestEntity[]> {
    return this.repo.find({ order: { uploadedAt: 'DESC' } });
  }

  async upload(
    file: Express.Multer.File,
    onProgress?: (done: number, total: number) => void,
  ): Promise<FileManifestEntity> {
    const tmpPath = file.path;
    try {
      const manifest = await uploadFile(this.discord.getClient(), {
        filePath: tmpPath,
        onProgress,
      });
      manifest.originalFilename = file.originalname;
      const entity = this.repo.create({ ...manifest, id: crypto.randomUUID() });
      return this.repo.save(entity);
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  }

  async startDownload(
    id: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<string> {
    const entry = await this.repo.findOneBy({ id });
    if (!entry) throw new NotFoundException(`File with id "${id}" not found`);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drivecord-dl-'));
    try {
      const outputPath = await downloadFile(this.discord.getClient(), entry, {
        manifestPath: '',
        outputDir: tmpDir,
        onProgress,
      });
      const buffer = fs.readFileSync(outputPath);
      const jobId = crypto.randomUUID();
      this.downloadJobs.set(jobId, { buffer, filename: entry.originalFilename });
      setTimeout(() => this.downloadJobs.delete(jobId), 10 * 60 * 1000);
      return jobId;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  getDownloadJob(jobId: string): DownloadJob | undefined {
    return this.downloadJobs.get(jobId);
  }

  async remove(id: string, deleteFromDiscord = false): Promise<void> {
    const entry = await this.repo.findOneBy({ id });
    if (!entry) throw new NotFoundException(`File with id "${id}" not found`);

    if (deleteFromDiscord) {
      const channel = await this.discord.fetchTextChannel(entry.channelId);
      await Promise.allSettled(
        entry.chunks.map((chunk) => channel.messages.delete(chunk.messageId)),
      );
    }

    await this.repo.delete(id);
  }
}
