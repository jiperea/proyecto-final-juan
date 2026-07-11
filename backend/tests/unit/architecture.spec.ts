import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Constitution III (hexagonal): el dominio NO importa infraestructura ni frameworks.
const FORBIDDEN = [
  'express',
  '@prisma/client',
  'prisma',
  'jsonwebtoken',
  'argon2',
  'helmet',
  'pino',
  'cookie-parser',
  'zod',
];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return tsFiles(full);
    }
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('arquitectura hexagonal (Constitution III)', () => {
  it('src/domain no importa express/prisma/jwt/argon2/helmet/pino/zod', () => {
    const offenders: string[] = [];
    for (const file of tsFiles('src/domain')) {
      const src = readFileSync(file, 'utf8');
      for (const mod of FORBIDDEN) {
        const re = new RegExp(`from ['"]${mod.replace('@', '@')}(/[^'"]*)?['"]`);
        if (re.test(src)) {
          offenders.push(`${file} → ${mod}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
