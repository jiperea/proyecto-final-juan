import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyExecutionGuard } from '../../src/domain/order/write-side/classify-execution-guard';

// T015 (005, H-004 checkpoint temprano) — `start` deriva el 404-vs-422 del MISMO clasificador propio de 005
// (classify-execution-guard.ts, T010b), NO de classifyZeroRows/applyTransition de 002b (precedencia vieja).
// Evita descubrir en Polish que start usó la precedencia antigua (estado antes que pertenencia).

const REPO = 'src/infra/repositories/order-write-side-repository.ts';
const START_UC = 'src/domain/order/write-side/start-order-work.ts';

describe('clasificador único compartido (005) — start no usa la precedencia de 002b', () => {
  it('el repo write-side importa y usa classifyExecutionGuard (clasificador propio de 005)', () => {
    const src = readFileSync(REPO, 'utf8');
    expect(src).toMatch(/import\s*\{\s*classifyExecutionGuard\s*\}\s*from/);
    // La rama de 0-filas de start invoca classifyExecutionGuard.
    expect(src).toContain('classifyExecutionGuard(');
  });

  it('el caso de uso de start NO reutiliza applyTransition/classifyZeroRows de 002b (uso, no prosa)', () => {
    const src = readFileSync(START_UC, 'utf8');
    // Sin import de apply-transition ni invocación de applyTransition()/classifyZeroRows() (los comentarios,
    // que sólo mencionan que NO se reutilizan, no cuentan).
    expect(src).not.toMatch(/from\s+['"][^'"]*apply-transition/);
    expect(src).not.toMatch(/\bapplyTransition\s*\(/);
    expect(src).not.toMatch(/\bclassifyZeroRows\b/);
  });

  it('parámetro discriminante: ajena en estado no legal → GUARD_UNMET (404), no INVALID_TRANSITION (422)', () => {
    // classifyZeroRows (002b) devolvería INVALID_TRANSITION (estado antes que pertenencia) para este caso con
    // versión coincidente. El clasificador de 005 devuelve GUARD_UNMET (pertenencia antes que estado).
    const ajena = classifyExecutionGuard(
      { status: 'closed', assignedTo: '018f1000-0000-7000-8000-000000000006' },
      { actorId: '018f1000-0000-7000-8000-000000000002', fromStatus: 'assigned', toStatus: 'in_progress' },
    );
    expect(ajena.code).toBe('GUARD_UNMET');
  });
});
