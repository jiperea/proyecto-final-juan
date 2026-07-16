import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Constitution III (hexagonal, 024): los puertos/tipos de EVIDENCIA no conocen cifrado/firma/filesystem
// ni frameworks/ORM. Ese conocimiento vive SOLO en los adaptadores infra/storage/* y
// infra/repositories/evidence-*. Este test fija esa frontera para los ficheros NUEVOS de 024 (T045).

const EVIDENCE_DOMAIN_FILES = [
  'src/domain/ports/storage.ts',
  'src/domain/order/read-side/evidence-read-ports.ts',
  'src/domain/order/write-side/evidence-upload-ports.ts',
  'src/domain/order/evidence.ts',
];

// Prohibido en el dominio: node:crypto/fs (cifrado/filesystem), frameworks/ORM, y cualquier import
// que "suba" a infra/ (el dominio no puede depender de adaptadores).
const FORBIDDEN_MODULES = [
  'node:crypto',
  'crypto',
  'node:fs',
  'node:fs/promises',
  'fs',
  'fs/promises',
  'express',
  '@prisma/client',
  'prisma',
];

const FORBIDDEN_PATH_FRAGMENT = /from ['"][^'"]*\/infra\//;

function importedModules(src: string): string[] {
  const matches = [...src.matchAll(/from ['"]([^'"]+)['"]/g)];
  return matches
    .map((m) => m[1])
    .filter((mod): mod is string => typeof mod === 'string');
}

describe('arquitectura de evidencia (Constitution III, 024, T045)', () => {
  it.each(EVIDENCE_DOMAIN_FILES)(
    '%s no importa cifrado/fs/express/prisma ni adaptadores infra/*',
    (file) => {
      const src = readFileSync(file, 'utf8');
      const modules = importedModules(src);

      for (const mod of FORBIDDEN_MODULES) {
        expect(
          modules.includes(mod),
          `${file} importa el módulo prohibido '${mod}'`,
        ).toBe(false);
      }

      expect(
        FORBIDDEN_PATH_FRAGMENT.test(src),
        `${file} importa un adaptador de infra/ (el dominio no puede depender de infra)`,
      ).toBe(false);
    },
  );

  it('el cifrado (AES-256-GCM) y el filesystem SOLO viven en infra/storage/* (positivo)', () => {
    const adapter = readFileSync('src/infra/storage/fs-storage-adapter.ts', 'utf8');
    expect(adapter).toContain('node:crypto');
    expect(/node:fs(\/promises)?/.test(adapter)).toBe(true);
    expect(adapter).toContain('createCipheriv');
  });
});
