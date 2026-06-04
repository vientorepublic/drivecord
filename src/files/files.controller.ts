import * as fs from 'fs';
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
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
  list(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.filesService.list(parseInt(page, 10), parseInt(limit, 10));
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    if (!file) {
      res.status(400).json({ message: 'No file provided' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abortCtrl = new AbortController();
    const onClose = () => abortCtrl.abort();
    req.on('close', onClose);

    try {
      writeSSE(res, { type: 'start', filename: file.originalname });

      const entry = await this.filesService.upload(
        file,
        (done, total) => {
          writeSSE(res, { type: 'progress', done, total });
        },
        abortCtrl.signal,
      );

      writeSSE(res, { type: 'done', file: entry });
    } catch (err) {
      const isAbort = (err as { name?: string })?.name === 'AbortError';
      writeSSE(res, {
        type: 'error',
        message: isAbort ? '취소됨' : err instanceof Error ? err.message : String(err),
      });
    } finally {
      req.off('close', onClose);
      res.end();
    }
  }

  @Post(':id/download')
  async startDownload(
    @Param('id') id: string,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abortCtrl = new AbortController();
    const onClose = () => abortCtrl.abort();
    req.on('close', onClose);

    try {
      writeSSE(res, { type: 'start' });

      const jobId = await this.filesService.startDownload(
        id,
        (done, total) => {
          writeSSE(res, { type: 'progress', done, total });
        },
        abortCtrl.signal,
      );

      writeSSE(res, { type: 'ready', jobId });
    } catch (err) {
      const isAbort = (err as { name?: string })?.name === 'AbortError';
      writeSSE(res, {
        type: 'error',
        message: isAbort ? '취소됨' : err instanceof Error ? err.message : String(err),
      });
    } finally {
      req.off('close', onClose);
      res.end();
    }
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
    // Clean up the temp file and job record once the response is fully sent.
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
