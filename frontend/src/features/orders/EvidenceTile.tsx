import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { InlineError, Spinner } from '../../ui';
import { useOrderEvidence } from './useOrders';

// 024 (T031) · FR-010/FR-013: tile clicable de evidencia. Cerrado = botón accesible «Ver imagen N»; al
// activarse dispara el fetch autenticado same-origin (useOrderEvidence) y, con el Blob resuelto, renderiza
// SIEMPRE desde un `blob:` en memoria (URL.createObjectURL) — nunca la URL del endpoint en el DOM. El
// object URL se libera (revokeObjectURL) al desmontar o al reemplazarse por uno nuevo.
export function EvidenceTile({
  orderId,
  evidenceId,
  index,
  total,
}: {
  orderId: string;
  evidenceId: string;
  index: number; // 1-based
  total: number;
}) {
  const [opened, setOpened] = useState(false);
  const query = useOrderEvidence(orderId, evidenceId, opened);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) {
      setBlobUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(query.data);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [query.data]);

  const label = `Imagen ${index}`;

  if (!opened) {
    return (
      <li className="order-detail__evidence-tile">
        <button
          type="button"
          className="order-detail__evidence-open"
          onClick={() => setOpened(true)}
          aria-label={`Ver ${label.toLowerCase()} de ${total}`}
        >
          {label}
        </button>
      </li>
    );
  }

  if (query.isPending) {
    return (
      <li className="order-detail__evidence-tile">
        <Spinner label={`Cargando ${label.toLowerCase()}…`} />
      </li>
    );
  }

  if (query.isError) {
    const err = query.error;
    const message = err instanceof ApiError ? err.userMessage : 'No se pudo cargar la imagen.';
    return (
      <li className="order-detail__evidence-tile">
        <InlineError onRetry={() => void query.refetch()}>{message}</InlineError>
      </li>
    );
  }

  return (
    <li className="order-detail__evidence-tile order-detail__evidence-tile--open">
      {blobUrl !== null ? (
        <img className="order-detail__evidence-img" src={blobUrl} alt={label} />
      ) : null}
    </li>
  );
}
