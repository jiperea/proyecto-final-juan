// T015 (US1) — frontera hexagonal del dominio IA (Constitution III): domain/ai es PURO.
// El proveedor (child_process/CLI) y Prisma se inyectan por puerto; el dominio no los importa.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = ['node:child_process', 'child_process', '@prisma/client', 'express', 'pino'];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? tsFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('frontera del dominio IA (007)', () => {
  it('src/domain/ai no importa child_process/prisma/express/pino (el proveedor se inyecta)', () => {
    const offenders: string[] = [];
    for (const file of tsFiles('src/domain/ai')) {
      const src = readFileSync(file, 'utf8');
      for (const mod of FORBIDDEN) {
        if (new RegExp(`from ['"]${mod}(/[^'"]*)?['"]`).test(src)) {
          offenders.push(`${file} → ${mod}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
