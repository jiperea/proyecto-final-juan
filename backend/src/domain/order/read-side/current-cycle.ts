// Ciclo vigente del detalle (#010, FR-002, D3). PURO. El reader ya resolvió el auditId del último
// submitOrderExecution y filtró notas/evidencia por ese auditId; aquí se derivan los campos de trabajo
// (notas + metadatos de evidencia) para technician dueño/supervisor.
import type { EvidenceMeta, OrderDetailSnapshot } from './ports';

// Metadatos de evidencia del ciclo vigente. `content_types` viene ordenado por `at` asc (id tiebreak)
// desde el reader; invariante count == length. Sin ciclo aún → { count: 0, contentTypes: [] } (un submit
// siempre trae ≥1 evidencia, 005 FR-004; count:0 solo ocurre antes del primer submit).
export function evidenceMetaFor(snapshot: OrderDetailSnapshot): EvidenceMeta {
  const contentTypes = snapshot.evidenceContentTypes;
  return { count: contentTypes.length, contentTypes };
}

// Notas del ciclo vigente. `undefined` (clave omitida) si no hay ciclo de ejecución o no hay notas.
export function notesFor(snapshot: OrderDetailSnapshot): string | undefined {
  if (snapshot.lastSubmit === null) {
    return undefined; // sin ciclo → notas omitidas
  }
  return snapshot.notes ?? undefined;
}
