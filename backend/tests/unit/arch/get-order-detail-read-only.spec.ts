// T030 (008/#010, Polish) — arquitectura read-only: el handler/dominio de #010 NO importa write-side ni
// muta status/version (FR-007). Complementa write-side-boundary (frontera de escritura de Order).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const READ_SIDE_FILES = [
  'src/handlers/orders/get-order-detail.ts',
  'src/handlers/orders/order-detail-types.ts',
  'src/handlers/middleware/auth-denied-log.ts',
  'src/infra/repositories/order-detail-reader.ts',
  'src/infra/audit/denied-access-logger.ts',
];

function domainReadSideFiles(): string[] {
  const dir = 'src/domain/order/read-side';
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? [] : full.endsWith('.ts') ? [full] : [];
  });
}

describe('arquitectura read-only #010 (FR-007)', () => {
  it('los ficheros de #010 NO importan write-side', () => {
    const offenders: string[] = [];
    for (const f of [...READ_SIDE_FILES, ...domainReadSideFiles()]) {
      const src = readFileSync(f, 'utf8');
      if (/from ['"][^'"]*write-side[^'"]*['"]/.test(src)) {
        offenders.push(`${f} → importa write-side`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('los ficheros de #010 NO mutan Order (Prisma write ni SQL crudo sobre orders)', () => {
    const orderWrite = /\.order\.(update|updateMany|upsert|create|createMany|delete|deleteMany)\s*\(/;
    const rawWrite = /(\$executeRaw|\$executeRawUnsafe)/;
    const offenders: string[] = [];
    for (const f of [...READ_SIDE_FILES, ...domainReadSideFiles()]) {
      const src = readFileSync(f, 'utf8');
      if (orderWrite.test(src)) offenders.push(`${f} → escritura Prisma`);
      if (rawWrite.test(src)) offenders.push(`${f} → SQL crudo/executeRaw`);
    }
    expect(offenders).toEqual([]);
  });

  it('el dominio read-side NO importa infra/frameworks (III)', () => {
    const forbidden = ['express', '@prisma/client', 'prisma', 'pino'];
    const offenders: string[] = [];
    for (const f of domainReadSideFiles()) {
      const src = readFileSync(f, 'utf8');
      for (const mod of forbidden) {
        if (new RegExp(`from ['"]${mod}(/[^'"]*)?['"]`).test(src)) {
          offenders.push(`${f} → ${mod}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
