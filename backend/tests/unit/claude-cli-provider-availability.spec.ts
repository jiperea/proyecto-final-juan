// 018 (FR-002/FR-006) — clasificación de disponibilidad del adaptador claude-cli:
// - guard dev-only (operable:false) → AI_UNAVAILABLE sin invocar el binario;
// - error de spawn no-ejecutable (ENOENT: binario ausente) → AI_UNAVAILABLE (501, no reintentable);
// - fallo POST-spawn (exit≠0 con binario presente) → SERVICE_UNAVAILABLE (503, transitorio).
import { describe, expect, it } from 'vitest';
import { ClaudeCliProvider } from '../../src/infra/ai/claude-cli-provider';
import type { PromptInput } from '../../src/domain/ai/summary-ports';

const INPUT: PromptInput = { notesRedacted: 'notas', evidence: { count: 1, contentTypes: ['image/jpeg'] } };

describe('ClaudeCliProvider — disponibilidad (018)', () => {
  it('guard dev-only: operable=false → AI_UNAVAILABLE sin invocar el binario', async () => {
    // binary inexistente a propósito: si se invocara daría ENOENT igualmente, pero el guard corta antes.
    const p = new ClaudeCliProvider({ timeoutMs: 1000, temperature: 0, operable: false, binary: 'no-existe-xyz' });
    const r = await p.generate(INPUT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('AI_UNAVAILABLE');
  });

  it('binario ausente (ENOENT) con operable=true → AI_UNAVAILABLE', async () => {
    const p = new ClaudeCliProvider({ timeoutMs: 2000, temperature: 0, operable: true, binary: '/no/existe/claude-xyz' });
    const r = await p.generate(INPUT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('AI_UNAVAILABLE');
  });

  it('binario presente que falla post-spawn (exit≠0) → SERVICE_UNAVAILABLE (transitorio)', async () => {
    // `false` existe en PATH y sale con código 1 → error nativo con code numérico, no de spawn → 503.
    const p = new ClaudeCliProvider({ timeoutMs: 2000, temperature: 0, operable: true, binary: 'false' });
    const r = await p.generate(INPUT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
