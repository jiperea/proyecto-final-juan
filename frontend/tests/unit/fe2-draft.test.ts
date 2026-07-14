import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { invalidateSession } from '../../src/api/session-store';
import { useExecutionDraft } from '../../src/features/orders/useExecutionDraft';

afterEach(() => sessionStorage.clear());

describe('FE-2 · borrador de notas (FR-009/FR-010)', () => {
  it('persiste las notas y las restaura para el mismo técnico+orden', () => {
    const { result, unmount } = renderHook(() => useExecutionDraft('sub-A', 'ord-1'));
    act(() => result.current.setNotes('borrador de Ana'));
    unmount();
    const again = renderHook(() => useExecutionDraft('sub-A', 'ord-1'));
    expect(again.result.current.notes).toBe('borrador de Ana');
  });

  it('otro técnico (sub distinto) NO ve el borrador ajeno', () => {
    const a = renderHook(() => useExecutionDraft('sub-A', 'ord-1'));
    act(() => a.result.current.setNotes('notas de A'));
    const b = renderHook(() => useExecutionDraft('sub-B', 'ord-1'));
    expect(b.result.current.notes).toBe('');
  });

  it('purga TODOS los borradores al cambiar de identidad (invalidar sesión, S-001)', () => {
    const a = renderHook(() => useExecutionDraft('sub-A', 'ord-1'));
    act(() => a.result.current.setNotes('notas de A'));
    expect(sessionStorage.length).toBeGreaterThan(0);
    act(() => invalidateSession());
    const drafts = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i)).filter((k) =>
      k?.startsWith('fe2-exec-draft:'),
    );
    expect(drafts).toHaveLength(0);
  });

  it('clear() borra el borrador (tras enviar)', () => {
    const { result } = renderHook(() => useExecutionDraft('sub-A', 'ord-1'));
    act(() => result.current.setNotes('x'));
    act(() => result.current.clear());
    expect(result.current.notes).toBe('');
  });
});
