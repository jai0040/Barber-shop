import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { loadConfig } from './config';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ResponseInterceptor } from './common/response.interceptor';

/** Shared by main.ts and the integration tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication) {
  const cfg = loadConfig();
  (app as NestExpressApplication).set('trust proxy', cfg.TRUST_PROXY);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: cfg.CORS_ORIGIN.split(','), credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
}
