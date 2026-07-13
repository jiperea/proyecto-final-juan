// Ensamblador del detalle por rol (#010, FR-001/002/005/006). PURO (recibe el redactor por puerto).
// Decide qué campos ve cada rol (mínimo privilegio) e invoca el pii-redactor FAIL-CLOSED sobre el motivo.
//
//  technician dueño  → order + notes + evidence + last_rejection_reason (si rechazo sin atender, saneado)
//  supervisor        → order + notes + evidence (sin motivo)
//  dispatcher        → order (sin notes/evidence/motivo — mínimo privilegio)
//
// Nota: la visibilidad (order-detail-visibility) ya garantizó que un technician que llega aquí es el DUEÑO
// actual (orderScopeFor filtra por assignedTo == actor), así que basta decidir por rol.
import type { OrderRecord } from '../model';
import { evidenceMetaFor, notesFor } from './current-cycle';
import type { EvidenceMeta, OrderDetailSnapshot, PiiRedactorPort } from './ports';
import { unattendedRejectionReason } from './rejection-reason';

// Vista interna (camelCase). El handler la mapea al DTO snake_case del contrato. Claves ausentes = omitidas.
export interface OrderDetailView {
  readonly order: OrderRecord;
  readonly notes?: string;
  readonly evidence?: EvidenceMeta;
  readonly lastRejectionReason?: string;
}

export interface AssembleInput {
  readonly role: string;
  readonly snapshot: OrderDetailSnapshot;
  readonly redactor: PiiRedactorPort;
}

// Motivo saneado FAIL-CLOSED: si el redactor lanza / no está disponible, se OMITE (nunca el reason crudo).
function sanitizedReason(snapshot: OrderDetailSnapshot, redactor: PiiRedactorPort): string | undefined {
  const raw = unattendedRejectionReason(snapshot);
  if (raw === null) {
    return undefined;
  }
  try {
    return redactor.redact(raw);
  } catch {
    return undefined; // fail-closed: omitir el motivo, nunca servir el crudo
  }
}

export function assembleOrderDetail(input: AssembleInput): OrderDetailView {
  const { role, snapshot, redactor } = input;
  const view: {
    order: OrderRecord;
    notes?: string;
    evidence?: EvidenceMeta;
    lastRejectionReason?: string;
  } = { order: snapshot.order };

  if (role === 'dispatcher') {
    return view; // mínimo privilegio: solo campos de la orden
  }

  // technician dueño y supervisor: notas + metadatos de evidencia del ciclo vigente.
  const notes = notesFor(snapshot);
  if (notes !== undefined) {
    view.notes = notes;
  }
  view.evidence = evidenceMetaFor(snapshot);

  // Solo el technician dueño ACTUAL ve el motivo del rechazo sin atender (saneado, fail-closed).
  if (role === 'technician') {
    const reason = sanitizedReason(snapshot, redactor);
    if (reason !== undefined) {
      view.lastRejectionReason = reason;
    }
  }

  return view;
}
