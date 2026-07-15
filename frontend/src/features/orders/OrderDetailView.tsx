import { useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { NOT_AVAILABLE_MESSAGE } from '../../i18n/errors';
import { Button, StatusBadge, useWideViewport } from '../../ui';
import { InlineError, Spinner } from '../../ui';
import { useSession } from '../auth/session';
import { ExecutionForm } from './ExecutionForm';
import { ReassignForm } from './ReassignForm';
import { StartWorkButton } from './StartWorkButton';
import { useOrderDetail } from './useOrders';
import './orders.css';

// FR-011/011b/012/013/013b/031: detalle solo-lectura por rol.
export function OrderDetailView({ orderId }: { orderId: string }) {
  const query = useOrderDetail(orderId);
  const { user } = useSession();
  const wide = useWideViewport();
  // Hooks del write-side del dispatcher (antes de returns tempranos — reglas de hooks).
  const [showReassign, setShowReassign] = useState(false);
  const [reassignAnnounce, setReassignAnnounce] = useState('');
  const assigneeRef = useRef<HTMLSpanElement>(null);

  if (query.isPending) return <Spinner label="Cargando detalle…" />;

  if (query.isError) {
    const err = query.error;
    // 404 (o fuera de ámbito) → mensaje uniforme (no distingue 403; no filtra existencia).
    if (err instanceof ApiError && err.status === 404) {
      return (
        <div className="state" role="status">
          {NOT_AVAILABLE_MESSAGE}
        </div>
      );
    }
    // 500/503 → error con reintento (FR-013b). El estado «vacío» no aplica al detalle.
    const message = err instanceof ApiError ? err.userMessage : 'Ha ocurrido un error. Reinténtalo.';
    return <InlineError onRetry={() => void query.refetch()}>{message}</InlineError>;
  }

  const { order, notes, evidence, last_rejection_reason } = query.data;
  // FR-007 (K-004): las acciones write se ofrecen SOLO al rol technician (ocultación por rol; el scope de
  // getOrderDetail ya garantiza que el técnico solo ve sus órdenes → el chequeo de pertenencia es redundante).
  const isTechnician = user?.role === 'technician';
  // FR-001/FR-018: la acción de reasignar se ofrece SOLO a dispatcher, en estados reasignables y en
  // escritorio (por debajo del breakpoint se oculta; el backend sigue siendo la autoridad).
  const canReassign =
    user?.role === 'dispatcher' &&
    (order.status === 'assigned' || order.status === 'in_progress') &&
    wide;
  return (
    <article className="order-detail" aria-busy={query.isFetching}>
      <h2 tabIndex={-1}>{order.title}</h2>
      {/* F-001: región viva → un lector de pantalla anuncia el cambio de estado (Iniciar/Enviar). */}
      <div role="status" aria-live="polite">
        <StatusBadge status={order.status} />
      </div>
      <p className="order-detail__desc">{order.description}</p>

      {isTechnician && order.status === 'assigned' ? (
        <section aria-label="Acciones de la orden">
          <StartWorkButton orderId={order.id} />
        </section>
      ) : null}
      {isTechnician && order.status === 'in_progress' ? (
        <section aria-label="Registrar ejecución">
          <h3>Registrar ejecución</h3>
          <ExecutionForm orderId={order.id} />
        </section>
      ) : null}

      {canReassign ? (
        <section aria-label="Reasignación">
          <p className="order-detail__assignee">
            Asignado a:{' '}
            <span ref={assigneeRef} tabIndex={-1}>
              {order.assigned_to ?? '—'}
            </span>
          </p>
          {/* FR-013: región viva que anuncia el resultado nombrando el destino. */}
          <div role="status" aria-live="polite">
            {reassignAnnounce}
          </div>
          {showReassign ? (
            <ReassignForm
              orderId={order.id}
              onReassigned={(updated) => {
                setShowReassign(false);
                setReassignAnnounce(`Orden reasignada a ${updated.assigned_to ?? '—'}`);
                assigneeRef.current?.focus(); // foco al asignatario (coincide con el anuncio)
              }}
            />
          ) : (
            <Button onClick={() => setShowReassign(true)}>Reasignar</Button>
          )}
        </section>
      ) : null}

      {/* Motivo del último rechazo: solo si viene en el payload (technician dueño con rechazo sin atender). */}
      {last_rejection_reason !== undefined ? (
        <section className="order-detail__rejection" aria-label="Motivo del último rechazo">
          <h3>Motivo del último rechazo</h3>
          {/* FR-011b: texto libre renderizado ESCAPADO (JSX escapa por defecto; nunca HTML crudo). */}
          <p>{last_rejection_reason}</p>
        </section>
      ) : null}

      {/* notes/evidence solo si el backend los envía (por presencia, FR-011). */}
      {notes !== undefined ? (
        <section aria-label="Notas de ejecución">
          <h3>Notas</h3>
          <p>{notes}</p>
        </section>
      ) : null}
      {evidence !== undefined ? (
        <section aria-label="Evidencia">
          <h3>Evidencia</h3>
          <p>{evidence.count} archivo(s)</p>
        </section>
      ) : null}
    </article>
  );
}
