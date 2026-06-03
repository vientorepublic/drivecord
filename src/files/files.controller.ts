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
import { FilesService } from './files.service';

function writeSSE(res: Response, data: object): void {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

@Controller('api/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  list() {
    return this.filesService.list();
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File, @Res() res: Response): Promise<void> {
    if (!file) {
      res.status(400).json({ message: 'No file provided' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      writeSSE(res, { type: 'start', filename: file.originalname });

      const entry = await this.filesService.upload(file, (done, total) => {
        writeSSE(res, { type: 'progress', done, total });
      });

      writeSSE(res, { type: 'done', file: entry });
    } catch (err) {
      writeSSE(res, {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      res.end();
    }
  }

  @Post(':id/download')
  async startDownload(@Param('id') id: string, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      writeSSE(res, { type: 'start' });

      const jobId = await this.filesService.startDownload(id, (done, total) => {
        writeSSE(res, { type: 'progress', done, total });
      });

      writeSSE(res, { type: 'ready', jobId });
    } catch (err) {
      writeSSE(res, {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      res.end();
    }
  }

  @Get('job/:jobId')
  serveJob(@Param('jobId') jobId: string, @Res() res: Response): void {
    const job = this.filesService.getDownloadJob(jobId);
    if (!job) throw new NotFoundException('Download job not found or expired');

    const encodedName = encodeURIComponent(job.filename);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', job.buffer.length);
    res.send(job.buffer);
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
