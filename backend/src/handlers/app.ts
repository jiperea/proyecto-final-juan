import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { createLogger } from '../infra/logger';
import { jsonErrorHandler } from './error-mapper';
import { correlation } from './middleware/correlation';
import { securityHeaders } from './middleware/security-headers';
import { healthHandler, readyHandler } from './ops';
import './http-types';

export interface AppDeps {
  readonly checkDb: () => Promise<boolean>;
}

// Ensambla la app HTTP (hexagonal: los handlers reciben sus dependencias por inyección).
// Se irá extendiendo con las rutas /v1/auth y /v1/rbac a medida que avancen las historias.
export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders());
  app.use(correlation(createLogger()));
  app.use(cookieParser());
  app.use(express.json());

  app.get('/health', healthHandler);
  app.get('/ready', readyHandler(deps.checkDb));

  app.use(jsonErrorHandler);
  return app;
}
