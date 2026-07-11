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

  it('la regla rol→alcance vive SOLO en scope-policy (no inline en handler/repo/use-case, FR-016)', () => {
    // NINGÚN literal de estado (de cualquier rol, incl. dispatcher) debe aparecer fuera de scope-policy.
    const statusLiterals = ["'assigned'", "'in_progress'", "'pending_review'", "'closed'", "'draft'"];
    const watched = [
      'src/handlers/orders/list.ts',
      'src/infra/repositories/order-repository.ts',
      'src/domain/order/list-orders.ts',
    ];
    const leaks: string[] = [];
    for (const f of watched) {
      let src = '';
      try {
        src = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      for (const lit of statusLiterals) {
        if (src.includes(lit)) {
          leaks.push(`${f} → ${lit}`);
        }
      }
    }
    expect(leaks).toEqual([]);
    // Positivo: el caso de uso invoca la política única.
    expect(readFileSync('src/domain/order/list-orders.ts', 'utf8')).toContain('orderScopeFor(');
  });
});
