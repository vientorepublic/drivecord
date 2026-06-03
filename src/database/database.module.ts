import * as path from 'path';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileManifestEntity } from './file-manifest.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: path.join(process.cwd(), 'data', 'drivecord.db'),
      entities: [FileManifestEntity],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([FileManifestEntity]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
