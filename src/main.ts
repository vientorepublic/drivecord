import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { exec } from 'child_process';
import { AppModule } from './app.module';
import { DriveCordLogger, printBanner, printReady } from './cli';
import { config } from './config';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;
  if (platform === 'darwin') cmd = `open "${url}"`;
  else if (platform === 'win32') cmd = `start "" "${url}"`;
  else cmd = `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) console.warn('[drivecord] Could not open browser automatically:', err.message);
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new DriveCordLogger(config.debug),
  });

  await app.listen(PORT);

  printBanner();

  printReady(PORT, config.debug);
  openBrowser(`http://localhost:${PORT}`);
}

bootstrap().catch((err: unknown) => {
  console.error('[drivecord] Fatal error:', err);
  process.exit(1);
});
