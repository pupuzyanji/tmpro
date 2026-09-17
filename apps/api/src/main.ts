import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Uploaded images/PDFs are stored as base64 data URIs and can round-trip
  // through plain JSON bodies (e.g. Settings > Organization re-saving a
  // form that still holds the logo it just uploaded) — Express's default
  // 100kb json/urlencoded limit is comfortably too small for that, so this
  // app supplies its own body parsers with a larger limit instead of
  // Nest's default ones (bodyParser: false here, then registered below).
  const app = await NestFactory.create(AppModule, { cors: true, bodyParser: false });
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`tmPro API listening on http://localhost:${port}/api`);
}
bootstrap();
