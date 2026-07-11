import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/handlers/app';
import type { Config } from '../../src/infra/config';
import { buildContainer } from '../../src/infra/container';

export function testConfig(): Config {
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
  };
}

export function makeTestApp(): { app: Express; prisma: PrismaClient } {
  const { deps, prisma } = buildContainer(testConfig());
  return { app: buildApp(deps), prisma };
}

export function cookieValue(setCookie: string[] | string | undefined, name: string): string {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const found = arr.find((c) => c.startsWith(`${name}=`));
  return found ? (found.split(';')[0]?.split('=')[1] ?? '') : '';
}
