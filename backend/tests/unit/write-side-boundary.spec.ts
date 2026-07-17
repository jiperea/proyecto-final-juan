import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// T023 (005, Polish) — frontera write-side: la ruta de ejecución (start/execution) NO muta status/version
// fuera de domain/order/write-side/* + infra/repositories/order-write-side-repository.ts (FR-006). La
// verificación del clasificador único compartido se adelantó a T015 (checkpoint US1).
const WRITE_REPO = 'order-write-side-repository.ts';
const REVIEW_REPO = 'order-review-repository.ts';
const EXEC_REPO = 'order-execution-repository.ts'; // 024: PrismaOrderExecutionRepository, separado por tamaño
// La CAPA write-side puede repartirse en varios ficheros (separados por tamaño); todos ellos son puntos
// legítimos de escritura de Order. El invariante es "sólo la capa write-side muta status/version".
const WRITE_SIDE_FILES = [WRITE_REPO, REVIEW_REPO, EXEC_REPO];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? tsFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('frontera write-side (005/006) — status/version sólo en la capa write-side', () => {
  it('ningún fichero fuera de la capa write-side escribe Order (Prisma o SQL crudo)', () => {
    const orderWrite = /\.order\.(update|updateMany|upsert|create|createMany|delete|deleteMany)\s*\(/;
    const rawOrderWrite = /(\$executeRaw|\$executeRawUnsafe)[^;]*\borders\b/;
    const offenders: string[] = [];
    for (const file of tsFiles('src')) {
      if (WRITE_SIDE_FILES.some((w) => file.endsWith(w))) continue;
      const src = readFileSync(file, 'utf8');
      if (orderWrite.test(src)) offenders.push(`${file} → escritura Prisma de Order`);
      if (rawOrderWrite.test(src)) offenders.push(`${file} → SQL crudo sobre orders`);
    }
    expect(offenders).toEqual([]);
  });

  it('los handlers de 005/006 (start/execution/review) NO escriben status/version directamente', () => {
    for (const f of [
      'src/handlers/orders/start.ts',
      'src/handlers/orders/execution.ts',
      'src/handlers/orders/review.ts',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/\.order\.(update|updateMany|upsert)\s*\(/);
      expect(src).not.toMatch(/\$executeRaw/);
    }
  });

  it('el repo write-side ES el único punto de escritura (start + execution + review)', () => {
    const repo = readFileSync(`src/infra/repositories/${WRITE_REPO}`, 'utf8');
    const execRepo = readFileSync(`src/infra/repositories/${EXEC_REPO}`, 'utf8');
    // start vive en order-write-side-repository.ts; execution (024) vive en su propio fichero (por tamaño,
    // ver EXEC_REPO más arriba) — ambos usan UPDATE condicional keyeado por status+assigned_to.
    expect(repo).toContain('class PrismaStartOrderWorkRepository');
    expect(execRepo).toContain('class PrismaOrderExecutionRepository');
    expect(execRepo).toMatch(/updateMany\(\{[\s\S]*?status: EXEC_FROM, assignedTo: actorId/);
    expect(repo).toMatch(/updateMany\(\{[\s\S]*?status: START_FROM, assignedTo: actorId/);
  });

  it('006 review vive en la capa write-side (order-review-repository) con UPDATE ... EXISTS(evidencia) atómico', () => {
    const reviewRepo = readFileSync(`src/infra/repositories/${REVIEW_REPO}`, 'utf8');
    expect(reviewRepo).toContain('class PrismaReviewOrderRepository');
    expect(reviewRepo).toMatch(/EXISTS \(SELECT 1 FROM order_evidence/);
  });

  it('006 review-order.ts NO reutiliza applyTransition/classifyZeroRows de 002b (llamada/import, no comentarios)', () => {
    const src = readFileSync('src/domain/order/write-side/review-order.ts', 'utf8');
    // Elimina comentarios de línea antes de comprobar (las notas SÍ mencionan "no reutiliza applyTransition").
    const code = src.replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/applyTransition\s*\(/);
    expect(code).not.toMatch(/classifyZeroRows/);
    expect(code).not.toMatch(/from ['"].*(apply-transition|transition-ports)['"]/);
  });
});
