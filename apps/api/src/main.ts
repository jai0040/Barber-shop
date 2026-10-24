import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadConfig } from './config';

async function bootstrap() {
  const cfg = loadConfig(); // fails fast on bad env
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(cfg.PORT);
}
bootstrap();
