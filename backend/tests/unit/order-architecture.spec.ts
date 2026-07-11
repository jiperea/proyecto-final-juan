import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = ['express', '@prisma/client', 'prisma', 'jsonwebtoken', 'argon2', 'helmet', 'pino'];

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

describe('arquitectura Order (Const. III + FR-016)', () => {
  it('src/domain/order no importa infra/frameworks', () => {
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

  it('la regla rol→alcance vive SOLO en scope-policy (no inline en handler/repo, FR-016)', () => {
    // El literal del alcance del technician sólo debe aparecer en scope-policy.ts.
    const marker = "'pending_review'";
    const leaks = [
      'src/handlers/orders/list.ts',
      'src/infra/repositories/order-repository.ts',
      'src/domain/order/list-orders.ts',
    ].filter((f) => {
      try {
        return readFileSync(f, 'utf8').includes(marker);
      } catch {
        return false;
      }
    });
    expect(leaks).toEqual([]);
  });
});
