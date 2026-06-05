import * as fs from 'fs';
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { SseEventType } from '../types';
import { setupSseResponse, runSseHandler } from './sse.helper';
import { FilesService } from './files.service';

@Controller('api/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  list(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.filesService.list(parseInt(page, 10), parseInt(limit, 10));
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Res() res: Response): Promise<void> {
    if (!file) {
      res.status(400).json({ message: 'No file provided' });
      return;
    }

    setupSseResponse(res);

    await runSseHandler(res, async (signal, write) => {
      write({ type: SseEventType.Start, filename: file.originalname });

      const entry = await this.filesService.upload(
        file,
        (done, total) => write({ type: SseEventType.Progress, done, total }),
        signal,
      );

      write({ type: SseEventType.Done, file: entry });
    });
  }

  @Post(':id/download')
  async startDownload(@Param('id') id: string, @Res() res: Response): Promise<void> {
    setupSseResponse(res);

    await runSseHandler(res, async (signal, write) => {
      write({ type: SseEventType.Start });

      const jobId = await this.filesService.startDownload(
        id,
        (done, total) => write({ type: SseEventType.Progress, done, total }),
        signal,
      );

      write({ type: SseEventType.Ready, jobId });
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.filesService.findOne(id);
  }

  @Get('job/:jobId')
  serveJob(@Param('jobId') jobId: string, @Res() res: Response): void {
    const job = this.filesService.getDownloadJob(jobId);
    if (!job) throw new NotFoundException('Download job not found or expired');

    const stat = fs.statSync(job.filePath);
    const encodedName = encodeURIComponent(job.filename);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);

    const stream = fs.createReadStream(job.filePath);
    stream.pipe(res);
    res.on('finish', () => this.filesService.removeDownloadJob(jobId));
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('discord') discord?: string,
  ): Promise<{ success: boolean }> {
    await this.filesService.remove(id, discord === 'true');
    return { success: true };
  }
}
