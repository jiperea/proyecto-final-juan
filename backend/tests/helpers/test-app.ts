import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { buildApp, type AppDeps } from '../../src/handlers/app';
import type { Config } from '../../src/infra/config';
import { buildContainer } from '../../src/infra/container';

export function testConfig(overrides: Partial<Config> = {}): Config {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL requerido para tests de integración (usa scripts/dcnode.sh)');
  }
  return {
    jwtSecret: 'j'.repeat(40),
    csrfSecret: 'c'.repeat(40),
    lockoutSecret: 'l'.repeat(40),
    databaseUrl,
    accessTtl: 900,
    refreshTtlDays: 7,
    graceMs: 10_000,
    lockoutMax: 5,
    lockoutWindowMin: 15,
    sessionStateTtlMs: 30_000,
    dbQueryTimeoutMs: 2000,
    port: 3000,
    nodeEnv: 'test',
    // 007: proveedor IA mock por defecto en tests (deterministas, sin red/CLI).
    aiProvider: 'mock',
    aiTimeoutMs: 10_000,
    aiTemperature: 0,
    aiMinNotesChars: 30,
    aiMinEvidence: 1,
    aiRateMax: 10,
    aiRateWindowMs: 60_000,
    ...overrides,
  };
}

export function makeTestApp(overrides: Partial<Config> = {}): { app: Express; prisma: PrismaClient } {
  const { deps, prisma } = buildContainer(testConfig(overrides));
  return { app: buildApp(deps), prisma };
}

// 007 — app con override de summaryDeps (provider spy / accessLog captor / thresholds), conservando el
// repo de fuente real (Postgres). Patrón de inyección de fallo/observabilidad (cf. review-db-errors).
type SummaryOverride = Partial<AppDeps['summaryDeps']>;
export function makeTestAppWithSummary(
  summaryOver: SummaryOverride,
  overrides: Partial<Config> = {},
): { app: Express; prisma: PrismaClient } {
  const { deps, prisma } = buildContainer(testConfig(overrides));
  const app = buildApp({ ...deps, summaryDeps: { ...deps.summaryDeps, ...summaryOver } });
  return { app, prisma };
}

// 008/#010 — app con override de orderDetailDeps (redactor que lanza / logger captor), conservando el
// reader real (Postgres). Patrón de inyección de fallo/observabilidad (cf. makeTestAppWithSummary).
type OrderDetailOverride = Partial<AppDeps['orderDetailDeps']>;
export function makeTestAppWithOrderDetail(
  over: OrderDetailOverride,
  overrides: Partial<Config> = {},
): { app: Express; prisma: PrismaClient } {
  const { deps, prisma } = buildContainer(testConfig(overrides));
  const app = buildApp({ ...deps, orderDetailDeps: { ...deps.orderDetailDeps, ...over } });
  return { app, prisma };
}

export function cookieValue(setCookie: string[] | string | undefined, name: string): string {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const found = arr.find((c) => c.startsWith(`${name}=`));
  return found ? (found.split(';')[0]?.split('=')[1] ?? '') : '';
}
