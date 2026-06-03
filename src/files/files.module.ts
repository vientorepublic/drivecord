import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { DatabaseModule } from '../database/database.module';
import { DiscordModule } from '../discord/discord.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [
    DatabaseModule,
    DiscordModule,
    MulterModule.register({
      storage: diskStorage({
        destination: os.tmpdir(),
        filename: (_req, file, cb) => {
          const unique = crypto.randomBytes(8).toString('hex');
          const ext = path.extname(file.originalname);
          cb(null, `drivecord-${unique}${ext}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
