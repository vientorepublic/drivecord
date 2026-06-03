import * as path from 'path';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { DatabaseModule } from './database/database.module';
import { FilesModule } from './files/files.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: path.join(__dirname, '..', 'public'),
      exclude: ['/api/{*path}'],
    }),
    DatabaseModule,
    FilesModule,
  ],
})
export class AppModule {}
