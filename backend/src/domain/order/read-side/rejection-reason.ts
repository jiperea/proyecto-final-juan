// Regla "rechazo SIN atender" (#010, FR-003, D2). PURO. El motivo del último rechazo se muestra si y solo
// si la última transición de rechazo (pending_review→in_progress) es ESTRICTAMENTE posterior al último
// submitOrderExecution: la orden está en in_progress tras un rechazo y aún NO se ha reenviado. Tras el
// reenvío (→ pending_review) el motivo se omite (motivo y notas quedan del MISMO ciclo).
//
// Desempate submit-vs-reject con el mismo `at`: gana el `id`/uuid v7 monótono mayor. Un reject registrado
// tras un submit tiene id mayor → se considera POSTERIOR → motivo visible.
import type { OrderDetailSnapshot } from './ports';

// Motivo CRUDO (sin sanear) del rechazo sin atender, o `null` si no procede mostrarlo. El saneo PII y el
// fail-closed los aplica el ensamblador (order-detail-assembler) antes de servirlo.
export function unattendedRejectionReason(snapshot: OrderDetailSnapshot): string | null {
  const reject = snapshot.lastReject;
  if (reject === null) {
    return null; // nunca rechazada
  }
  const submit = snapshot.lastSubmit;
  if (submit === null) {
    return reject.reason; // rechazo sin submit posterior → sin atender
  }
  if (reject.at.getTime() > submit.at.getTime()) {
    return reject.reason; // reject estrictamente posterior → sin atender
  }
  if (reject.at.getTime() === submit.at.getTime() && reject.id > submit.id) {
    return reject.reason; // empate de `at`: desempata el uuid v7 monótono mayor (reject posterior)
  }
  return null; // ya reenviada (submit posterior o igual) → motivo omitido
}
