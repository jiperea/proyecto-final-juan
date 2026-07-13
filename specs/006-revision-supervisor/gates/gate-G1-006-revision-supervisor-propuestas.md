# G1 · 006-revision-supervisor — Propuestas de remediación

**Gate**: G1 · **Veredicto**: BLOQUEADA (2 BLOQUEANTES, 4 ALTAS, 7 MEDIAS, 1 BAJA)
**Fecha**: 2026-07-13 · **Proposer**: `remediador` (propone, no aplica)
**Panel**: `revisor-cinico`, `auditor-spec-theater`, `revisor-rbac-seguridad`

> Orden sugerido de resolución: **B1 → B2 → A2 → A1 → A3 → M1/M2/M3/M6/M4/M5/M7/M8 → L1**.
> B1/A1/A2 tocan la misma cadena de precedencia (FR-009) y conviene resolverlas juntas.

## BLOQUEANTES

### B1 — Motivo en la aprobación (TBD auto-reconocido)
**Propuesta**: el `reason` en aprobación es **opcional**; si **está presente** en el body se valida con las
**mismas** reglas que el rechazo (pre-saneo, 1–1000, → `422 INVALID_REASON`); si está **ausente/`null`**, aprueba
sin motivo (`OrderAudit.reason = NULL`). FR-009: el 422 de motivo ocupa la misma posición (tras 403, antes de
404), en rechazo siempre y en aprobación solo si `reason` presente. **Decisión humana: NO** (default seguro).

### B2 — Lectura de insumos de revisión (evidencia/notas/motivo) — **DECISIÓN HUMANA**
El supervisor "revisa el trabajo" pero **ningún** artefacto expone un endpoint de detalle (notas + metadatos de
evidencia); y el technician necesita leer el **motivo de su rechazo**, pero Constitution XI restringe la lectura
de `OrderAudit.reason` a supervisor/auditor.
- **(a)** Ampliar 006 con lectura de detalle → sube el alcance de 006 y **exige enmendar Constitution XI**
  (technician lee su motivo). Reabre G1 con FRs/tests de lectura.
- **(b) RECOMENDADA**: declarar la lectura de detalle **fuera de 006** (feature read-side; ya implícita en FE-1
  "detalle solo-lectura") y **trazar la deuda** en el roadmap como prerequisito de FE-1/FE-4, con el gap de
  RBAC-technician marcado para enmienda de Constitution XI **antes** de implementar esa lectura. Mantiene 006
  pequeña (XV) y fiel al Brief Func #3 ("aprobar/rechazar", no "consultar").

## ALTAS

- **A1** (saneo indefinido): definir `sanitizeReason()` local a 006 — trim + colapso de espacios + strip de
  control chars (Cc, salvo `\n`) + NFC; "vacío tras saneo" = longitud 0. Nota de deuda para retro-alinear
  003/004/005 (no bloqueante). **Decisión humana: NO.**
- **A2** (`decision` malformado): nuevo FR → `decision` ausente/fuera de enum/body no-JSON → `422
  VALIDATION_ERROR` (código ya usado en 005), evaluado **antes** que `INVALID_REASON` (sin `decision` no se sabe
  si el motivo es obligatorio). **Decisión humana: NO.**
- **A3** (`attempt`): aclarar que 006 **no** lee ni incrementa `attempt`; el versionado por intento (si se hace)
  es responsabilidad de **005** en el reenvío, o carve-out de #008. **Decisión humana: NO.**

## MEDIAS / BAJA (resolución autoconsistente)

- **M1**: FR-010 → 500 genérico para errores no transitorios (ACTOR_INVALID/constraint); 503 solo "BD no
  disponible" *(autoritativa vs 003)*.
- **M2**: FR-007 → citar regla (a) 404 de 003 FR-009 (visibilidad del supervisor = state-scoped a
  `pending_review`; no aplica la (b)/403 de pertenencia) *(autoritativa)*.
- **M3**: nuevo FR + test → actor de la auditoría derivado **solo** del JWT server-side (como 005 FR-007).
- **M4**: §Alcance → auditoría forense de accesos denegados diferida a **#009** (como 005).
- **M5**: Assumption → unicidad de rol operativo por usuario; SoD formal = backlog.
- **M6**: guard defensivo fail-closed → aprobar verifica ≥1 evidencia (código exacto a fijar en plan). *(Añade
  una query; valorar coste vs confiar en invariante de 005.)*
- **M7**: Assumption → nº de rechazos observable contando `OrderAudit {from:pending_review, to:in_progress}`
  (sin columna nueva); tope duro = backlog.
- **M8**: Edge case → sin interacción con `reassignOrder` (004 solo actúa sobre assigned/in_progress)
  *(autoritativa)*.
- **L1**: SC-006 → medir p95 < 300 ms **por separado** para `approve` y `reject` (motivo hasta 1000 chars).

## Decisión pendiente antes de re-ejecutar G1

Solo **B2** requiere decisión humana (alcance + posible enmienda de Constitution XI). Resto: aplicar defaults
recomendados vía **re-ejecución de `/speckit-clarify`** (no edición a mano) → re-ejecutar **G1**.
