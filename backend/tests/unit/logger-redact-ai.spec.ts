// T020/I-002 (007, FR-005/SC-003) — no-fuga en logs: el logger redacta el resumen (summary), el prompt
// y las notas, top-level y anidados. El evento de acceso (access.ai_summary) no los lleva por construcción;
// esto verifica la defensa en profundidad (REDACT_PATHS) por si algo intentara logearlos.
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/infra/logger';

const S_SUMMARY = 'RESUMEN_SENTINEL_zzz';
const S_PROMPT = 'PROMPT_SENTINEL_zzz';
const S_NOTES = 'NOTES_SENTINEL_zzz';

describe('no-fuga en logs del resumen IA (007)', () => {
  it('redacta summary/prompt/notes (top-level y anidados)', () => {
    const lines: string[] = [];
    const logger = createLogger({ stream: { write: (s: string) => lines.push(s) } });
    logger.info({ summary: S_SUMMARY, prompt: S_PROMPT, notes: S_NOTES }, 'top-level');
    logger.info({ ai: { summary: S_SUMMARY, prompt: S_PROMPT } }, 'anidado');
    const out = lines.join('');
    expect(out).not.toContain(S_SUMMARY);
    expect(out).not.toContain(S_PROMPT);
    expect(out).not.toContain(S_NOTES);
    expect(out).toContain('[Redacted]');
  });
});
