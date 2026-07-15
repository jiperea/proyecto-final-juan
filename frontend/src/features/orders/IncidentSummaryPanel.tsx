import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { Button } from '../../ui';
import { summarizeIncident } from './write-api';

type PanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'summary'; text: string }
  | { kind: 'insufficient' }
  | { kind: 'unavailable' } // 018: proveedor IA no operable en este entorno (dev-only) — sin reintento
  | { kind: 'error'; message: string };

// FR-010/011/011b/016 · panel de resumen IA. BAJO DEMANDA (botón); el cliente distingue por `sufficient`
// (no inventa). Descarta respuestas fuera de orden (reqId) y se limpia al cambiar de orden. En 429
// deshabilita el botón durante `Retry-After`. FE-4 solo muestra el resultado (eval de la IA = backend 007).
export function IncidentSummaryPanel({ orderId }: { orderId: string }) {
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const [cooldown, setCooldown] = useState(false); // 429: botón deshabilitado durante Retry-After
  const reqId = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // No se cachea entre órdenes: al cambiar de orden se limpia (FR-011b).
  useEffect(() => {
    reqId.current += 1; // invalida cualquier respuesta en vuelo de la orden anterior
    setState({ kind: 'idle' });
    setCooldown(false);
  }, [orderId]);

  async function requestSummary() {
    if (state.kind === 'loading' || cooldown || state.kind === 'unavailable') return; // sin doble envío / cooldown / no operable
    const id = (reqId.current += 1);
    setState({ kind: 'loading' });
    try {
      const res = await summarizeIncident(orderId);
      if (id !== reqId.current) return; // respuesta fuera de orden / de otra orden → descartar
      setState(res.sufficient && res.summary ? { kind: 'summary', text: res.summary } : { kind: 'insufficient' });
      headingRef.current?.focus();
    } catch (err) {
      if (id !== reqId.current) return;
      // 018/FR-003: proveedor no operable en ESTE entorno (dev-only) → estado terminal, sin reintento.
      if (err instanceof ApiError && err.code === 'AI_UNAVAILABLE') {
        setState({ kind: 'unavailable' });
        return;
      }
      if (err instanceof ApiError && err.status === 429) {
        const secs = err.retryAfterSeconds ?? 30;
        setState({ kind: 'error', message: `Demasiadas solicitudes. Espera ${secs} s antes de reintentar.` });
        setCooldown(true);
        window.setTimeout(() => setCooldown(false), secs * 1000);
        return;
      }
      const message = err instanceof ApiError ? err.userMessage : 'No disponible. Reinténtalo.';
      setState({ kind: 'error', message });
    }
  }

  return (
    <section className="ai-summary" aria-label="Resumen de la incidencia (IA)">
      <h3 ref={headingRef} tabIndex={-1}>
        Resumen (IA)
      </h3>
      <div role="status" aria-live="polite">
        {state.kind === 'summary' ? (
          <>
            <p className="ai-summary__text">{state.text}</p>
            {/* Nota de guardián (texto estático, FR-008): explica el origen y el no-inventar. */}
            <p className="ai-summary__guard">
              Generado a partir de las notas y la evidencia. Si no hubiera material suficiente, el
              asistente lo indica y no inventa el resumen.
            </p>
          </>
        ) : state.kind === 'insufficient' ? (
          <p>No hay material suficiente para generar un resumen. No se ha inventado nada.</p>
        ) : state.kind === 'unavailable' ? (
          <p role="note">El resumen por IA no está disponible en este entorno.</p>
        ) : state.kind === 'error' ? (
          <p className="field__error" role="alert">
            {state.message}
          </p>
        ) : null}
      </div>
      <Button
        onClick={() => void requestSummary()}
        aria-busy={state.kind === 'loading'}
        aria-disabled={state.kind === 'loading' || cooldown || state.kind === 'unavailable' || undefined}
        disabled={state.kind === 'unavailable'}
      >
        {state.kind === 'loading' ? 'Resumiendo…' : 'Resumir con IA'}
      </Button>
    </section>
  );
}
