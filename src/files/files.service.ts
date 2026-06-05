import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uploadFile, deleteMessagesThrottled } from '../uploader';
import { downloadFile } from '../downloader';
import { DiscordService } from '../discord/discord.service';
import { FileManifestEntity } from '../database/file-manifest.entity';

interface DownloadJob {
  /** Absolute path to the downloaded file in a temporary directory. */
  filePath: string;
  filename: string;
  /** Cancel the TTL timer, remove from map, and delete the temp directory. */
  cleanup: () => void;
}

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);
  private readonly downloadJobs = new Map<string, DownloadJob>();
  private readonly MAX_DOWNLOAD_JOBS = 10;

  constructor(
    private readonly discord: DiscordService,
    @InjectRepository(FileManifestEntity)
    private readonly repo: Repository<FileManifestEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.migrateOldManifests();
  }

  private async migrateOldManifests(): Promise<void> {
    const jsonPath = path.join(process.cwd(), 'data', 'manifests.json');
    if (!fs.existsSync(jsonPath)) return;

    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const entries: FileManifestEntity[] = JSON.parse(raw);
      if (Array.isArray(entries) && entries.length > 0) {
        await this.repo.save(entries);
        this.logger.log(`manifests.json → DB: ${entries.length} entries migrated`);
      }
      fs.renameSync(jsonPath, jsonPath + '.migrated');
    } catch (err) {
      this.logger.warn('manifests.json migration failed: ' + String(err));
    }
  }

  async list(page = 1, limit = 20): Promise<{ data: FileManifestEntity[]; total: number }> {
    const safePage = Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1;
    const safeLimit = Number.isFinite(limit) && limit >= 1 && limit <= 100 ? Math.trunc(limit) : 20;
    const [data, total] = await this.repo.findAndCount({
      order: { uploadedAt: 'DESC' },
      take: safeLimit,
      skip: (safePage - 1) * safeLimit,
    });
    return { data, total };
  }

  async findOne(id: string): Promise<FileManifestEntity> {
    const entry = await this.repo.findOneBy({ id });
    if (!entry) throw new NotFoundException(`File with id "${id}" not found`);
    return entry;
  }

  async upload(
    file: Express.Multer.File,
    onProgress?: (done: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<FileManifestEntity> {
    const tmpPath = file.path;
    const t0 = Date.now();
    this.logger.debug(
      `Upload started — "${file.originalname}" (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
    );
    try {
      const manifest = await uploadFile(this.discord.getClient(), {
        filePath: tmpPath,
        onProgress,
        signal,
        onRetry: (chunkIndex, attempt, maxRetries) => {
          this.logger.debug(`Chunk ${chunkIndex} retry ${attempt + 1}/${maxRetries}`);
        },
      });
      // Guard against the race where all chunks finished just before the client
      // cancelled: uploadFile may return successfully if the abort signal arrived
      // after the last chunk's network call completed but before this line.
      signal?.throwIfAborted();
      manifest.originalFilename = file.originalname;
      const entity = this.repo.create({ ...manifest, id: crypto.randomUUID() });
      const saved = await this.repo.save(entity);
      this.logger.debug(
        `Upload done — ${manifest.totalChunks} chunks, ${Date.now() - t0}ms, id=${saved.id}`,
      );
      return saved;
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  }

  async startDownload(
    id: string,
    onProgress?: (done: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const entry = await this.repo.findOneBy({ id });
    if (!entry) throw new NotFoundException(`File with id "${id}" not found`);

    const t0 = Date.now();
    this.logger.debug(
      `Download started — "${entry.originalFilename}" (${entry.totalChunks} chunks)`,
    );

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'drivecord-dl-'));
    try {
      await downloadFile(this.discord.getClient(), entry, {
        manifestPath: '',
        outputDir: tmpDir,
        onProgress,
        signal,
      });
    } catch (err) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw err;
    }
    this.logger.debug(`Download done — ${Date.now() - t0}ms`);

    const outputPath = path.join(tmpDir, entry.originalFilename);
    const jobId = crypto.randomUUID();

    // Evict the oldest job if we are at capacity to prevent unbounded growth.
    if (this.downloadJobs.size >= this.MAX_DOWNLOAD_JOBS) {
      const [, oldestJob] = [...this.downloadJobs.entries()][0];
      oldestJob.cleanup();
    }

    // Capture timer ref so cleanup can cancel it if the job is served before TTL.
    // cleanup is defined first; timer is assigned immediately after and captured
    // by the closure — safe because cleanup is only ever called after this block.
    const cleanup = (): void => {
      clearTimeout(timer);
      this.downloadJobs.delete(jobId);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    };
    const timer = setTimeout(cleanup, 10 * 60 * 1000);
    // Don't prevent the process from exiting cleanly just for a download job TTL.
    (timer as NodeJS.Timeout & { unref?: () => void }).unref?.();

    this.downloadJobs.set(jobId, {
      filePath: outputPath,
      filename: entry.originalFilename,
      cleanup,
    });
    return jobId;
  }

  getDownloadJob(jobId: string): DownloadJob | undefined {
    return this.downloadJobs.get(jobId);
  }

  /** Cancel TTL timer, remove from map, and delete the temp file. */
  removeDownloadJob(jobId: string): void {
    const job = this.downloadJobs.get(jobId);
    if (job) job.cleanup();
  }

  async remove(id: string, deleteFromDiscord = false): Promise<void> {
    const entry = await this.repo.findOneBy({ id });
    if (!entry) throw new NotFoundException(`File with id "${id}" not found`);

    if (deleteFromDiscord) {
      const channel = await this.discord.fetchTextChannel(entry.channelId);
      await deleteMessagesThrottled(
        channel,
        entry.chunks.map((chunk) => chunk.messageId),
      );
    }

    await this.repo.delete(id);
  }
}
