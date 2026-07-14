import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeSession } from '../../api/session-store';

// FR-009/FR-010/H-101: borrador de NOTAS (solo texto) en sessionStorage, para sobrevivir a un
// backgrounding/remount del navegador móvil al capturar foto. Las evidencias NO se persisten (el object
// URL no sobrevive al remount) → se re-piden. La clave incluye el `sub` del técnico y el `orderId`; al
// cambiar de identidad (logout/rol) se purgan todos los borradores → nunca se heredan entre técnicos.

const PREFIX = 'fe2-exec-draft:';
const keyFor = (sub: string, orderId: string) => `${PREFIX}${sub}:${orderId}`;

function purgeAllDrafts(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* sessionStorage no disponible: no-op */
  }
}

export function useExecutionDraft(sub: string, orderId: string) {
  const key = keyFor(sub, orderId);
  const [notes, setNotesState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  });
  const keyRef = useRef(key);
  keyRef.current = key;

  // Seguridad (S-001, security-first): ante CUALQUIER evento de sesión (logout, refresh fallido, cambio de
  // rol) se purgan TODOS los borradores → nunca queda PII de un técnico en un dispositivo compartido. El
  // aislamiento PRIMARIO es la clave por `sub` (un técnico jamás lee el borrador de otro aunque no se purgara).
  // NO condicionar esta purga a "solo si cambia el sub": reabriría S-001 (BLOQUEANTE) — preferimos perder un
  // borrador en un fallo de refresh del mismo técnico (recuperable) a arriesgar fuga entre identidades.
  useEffect(() => subscribeSession(() => purgeAllDrafts()), []);

  const setNotes = useCallback((value: string) => {
    setNotesState(value);
    try {
      if (value) sessionStorage.setItem(keyRef.current, value);
      else sessionStorage.removeItem(keyRef.current);
    } catch {
      /* no-op */
    }
  }, []);

  const clear = useCallback(() => {
    setNotesState('');
    try {
      sessionStorage.removeItem(keyRef.current);
    } catch {
      /* no-op */
    }
  }, []);

  return { notes, setNotes, clear };
}
