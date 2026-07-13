import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// T023 (005, Polish) — frontera write-side: la ruta de ejecución (start/execution) NO muta status/version
// fuera de domain/order/write-side/* + infra/repositories/order-write-side-repository.ts (FR-006). La
// verificación del clasificador único compartido se adelantó a T015 (checkpoint US1).
const WRITE_REPO = 'order-write-side-repository.ts';

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? tsFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('frontera write-side (005) — status/version sólo en el repo write-side', () => {
  it('ningún fichero fuera del repo write-side escribe Order (Prisma o SQL crudo)', () => {
    const orderWrite = /\.order\.(update|updateMany|upsert|create|createMany|delete|deleteMany)\s*\(/;
    const rawOrderWrite = /(\$executeRaw|\$executeRawUnsafe)[^;]*\borders\b/;
    const offenders: string[] = [];
    for (const file of tsFiles('src')) {
      if (file.endsWith(WRITE_REPO)) continue;
      const src = readFileSync(file, 'utf8');
      if (orderWrite.test(src)) offenders.push(`${file} → escritura Prisma de Order`);
      if (rawOrderWrite.test(src)) offenders.push(`${file} → SQL crudo sobre orders`);
    }
    expect(offenders).toEqual([]);
  });

  it('los handlers de 005 (start/execution) NO escriben status/version directamente', () => {
    for (const f of ['src/handlers/orders/start.ts', 'src/handlers/orders/execution.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/\.order\.(update|updateMany|upsert)\s*\(/);
      expect(src).not.toMatch(/\$executeRaw/);
    }
  });

  it('el repo write-side ES el único punto de escritura (start + execution)', () => {
    const repo = readFileSync(`src/infra/repositories/${WRITE_REPO}`, 'utf8');
    // start y execution viven en el repo write-side y usan UPDATE condicional keyeado por status+assigned_to.
    expect(repo).toContain('class PrismaStartOrderWorkRepository');
    expect(repo).toContain('class PrismaOrderExecutionRepository');
    expect(repo).toMatch(/updateMany\(\{[\s\S]*?status: EXEC_FROM, assignedTo: actorId/);
    expect(repo).toMatch(/updateMany\(\{[\s\S]*?status: START_FROM, assignedTo: actorId/);
  });
});
