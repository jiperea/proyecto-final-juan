import { ApiError } from '../../api/client';
import { NOT_AVAILABLE_MESSAGE } from '../../i18n/errors';
import { StatusBadge } from '../../ui';
import { InlineError, Spinner } from '../../ui';
import { useOrderDetail } from './useOrders';
import './orders.css';

// FR-011/011b/012/013/013b/031: detalle solo-lectura por rol.
export function OrderDetailView({ orderId }: { orderId: string }) {
  const query = useOrderDetail(orderId);

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
  return (
    <article className="order-detail" aria-busy={query.isFetching}>
      <h2 tabIndex={-1}>{order.title}</h2>
      <StatusBadge status={order.status} />
      <p className="order-detail__desc">{order.description}</p>

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
