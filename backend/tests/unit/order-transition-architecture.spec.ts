import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = ['express', '@prisma/client', 'prisma', 'jsonwebtoken', 'argon2', 'helmet', 'pino'];
// La CAPA write-side puede repartirse en varios ficheros (separados por tamaño; 006 añadió order-review,
// 024 añadió order-execution). El invariante es "sólo la capa write-side muta status/version" (BL-071:
// carpeta, no un único fichero).
const WRITE_SIDE_FILES = [
  'order-write-side-repository.ts',
  'order-review-repository.ts',
  'order-execution-repository.ts',
];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory()
      ? tsFiles(full)
      : full.endsWith('.ts')
        ? [full]
        : [];
  });
}

describe('arquitectura transición (FR-006, Const. III, D6)', () => {
  it('domain/order no importa infra ni frameworks', () => {
    const offenders: string[] = [];
    for (const file of tsFiles('src/domain/order')) {
      const src = readFileSync(file, 'utf8');
      for (const mod of FORBIDDEN) {
        if (new RegExp(`from ['"]${mod}(/[^'"]*)?['"]`).test(src)) {
          offenders.push(`${file} → ${mod}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('status/version SÓLO se escriben en el repo de transición (búsqueda estática)', () => {
    const orderWrite = /\.order\.(update|updateMany|upsert)\s*\(/;
    const rawOrderWrite = /(\$executeRaw|\$executeRawUnsafe)[^;]*\borders\b/;
    const offenders: string[] = [];
    for (const file of tsFiles('src')) {
      if (WRITE_SIDE_FILES.some((w) => file.endsWith(w))) continue;
      const src = readFileSync(file, 'utf8');
      if (orderWrite.test(src)) offenders.push(`${file} → escritura Prisma de Order`);
      if (rawOrderWrite.test(src)) offenders.push(`${file} → SQL crudo sobre orders`);
    }
    expect(offenders).toEqual([]);

    // El repo de 002a (read-side) NO escribe status/version.
    const repo002a = readFileSync('src/infra/repositories/order-repository.ts', 'utf8');
    expect(orderWrite.test(repo002a)).toBe(false);

    // Positivo: el repo de transición ES el único punto de escritura.
    const transitionRepo = readFileSync(
      'src/infra/repositories/order-write-side-repository.ts',
      'utf8',
    );
    expect(/\.order\.updateMany\s*\(/.test(transitionRepo)).toBe(true);
  });
});
