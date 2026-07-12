# Gate G1 — 004-orden-reasignacion (feature 003 del roadmap)

**Fase**: G1 (tras `/speckit-clarify`) · **Panel**: `revisor-cinico` + `auditor-spec-theater` + `revisor-rbac-seguridad`
**Artefacto**: `specs/004-orden-reasignacion/spec.md` · **Fecha**: 2026-07-11

## Veredicto (1ª pasada): **FAIL** — 4 BLOQUEANTES

Criterio de avance: 0 BLOQUEANTES (Constitution XIII). Se remedia como autor (los revisores hallaron; la
re-ejecución del panel valida — separación de funciones) y se re-ejecuta G1.

## Hallazgos consolidados (deduplicados, por severidad)

| ID | Panel | Sev | Descripción | Cierre |
|----|-------|-----|-------------|--------|
| H-002 | cínico | **BLOQ** | Origen de `expectedVersion` no definido en camino MVP (contrato sin campo versión) → TOCTOU | FR-008: `expectedVersion` **derivado server-side** de la lectura de visibilidad; UPDATE condicional cierra el hueco |
| S-001 | rbac | **BLOQ** | FR-008 evalúa version antes que status → bajo carrera filtra 409 donde debe ser 404 | FR-008: **status-no-reasignable tiene PRECEDENCIA** sobre version en la reclasificación de 0 filas |
| T-001 | theater | **BLOQ** | Longitud máxima de `reason` = placeholder `N` | FR-006/contrato: **`reason` 1..500 caracteres** |
| T-002 | theater | **BLOQ** | Sin umbral latencia 404 + escape "o documentado" | FR-004/SC-008: 404 missing/no-visible por **la MISMA consulta** (`WHERE id AND status IN reasignable`) → indistinguible **por construcción**; test byte-identical body+headers; se elimina el escape |
| H-001/H-005 | cínico | ALTA | `assigned_to` NULL real (`onDelete:SetNull`) tratado como hipotético | Caso real: reasignación de orden huérfana válida (`from_assignee` nullable); se quita "a confirmar" |
| H-003 | cínico | ALTA | Orden de validación (destino antes que visibilidad) = oráculo por código HTTP | FR-004/FR-005: **visibilidad (404) ANTES** que validez de destino (422) |
| H-004 | cínico | ALTA | Validaciones FR-005 fuera de guarda fresca → TOCTOU | FR-008: `from_assignee` y "distinto del actual" con el **dato version-matched**; destino-deshabilitado = residual best-effort documentado |
| S-002 | rbac | ALTA | PII cruda persistida en `reason` sin purga (Const. XI) | Residual heredado + `max 500` + guía; procedimiento correctivo **BL-055**, cifrado **BL-051** |
| S-003 | rbac | ALTA | 422 `INVALID_ASSIGNEE` = oráculo de enumeración de usuarios | FR-005: **cuerpo 422 genérico e idéntico** para las 4 causas (sin `details` distintivo) |
| H-006 | cínico | MEDIA | Carrera cruzada reasignación↔transición FSM → 404 no 409 | Resuelto con S-001 (status tiene precedencia) |
| H-007 | cínico | MEDIA | Migración `event_type`: ¿toca código de 003 mergeado? | Migración con `DEFAULT 'transition'` + backfill; `applyTransition` NO cambia (no viola XV) |
| H-008 | cínico | MEDIA | `reassignOrder` vs `applyTransition`: ¿helper común o divergencia? | Comparten **primitiva atómica** de bajo nivel (UPDATE condicional + insert auditoría transaccional) |
| H-009 | cínico | MEDIA | "Deuda saldada" optimista (BL-056/061/062 son 003/004/005) | Assumptions: 003 salda **su porción**; BL-056/061/062 siguen abiertos para 005/006 |
| H-010 | cínico | MEDIA | SC-008 "o documentado" cierra BL-061 con una nota | Resuelto con T-002 (indistinguibilidad por construcción, sin escape) |
| T-003 | theater | MEDIA | "Mismo módulo" indefinido | FR-007: `domain/order/write-side/` + test de arquitectura (nada fuera muta status/version) |
| T-004 | theater | MEDIA | SC-010 p95 sin tamaño de muestra | SC-010: **50 peticiones secuenciales, BD caliente** |
| S-005 | rbac | BAJA | Visibilidad global del dispatcher | Confirmado: **decisión aceptada** (Const. IV, org plana) |

## Trazabilidad de cierre → ver `spec.md` (Clarifications sesión 2026-07-11 + FRs/SCs remediados) y G1 re-entrada.

---

## Re-entrada #1 (2026-07-12): **FAIL** — la remediación no se había propagado al artefacto

Al re-ejecutar el panel sobre `spec.md` se detectó que la tabla de cierre de la 1ª pasada documentaba
resoluciones que **nunca llegaron al texto de la spec**. 3 BLOQUEANTES convergentes + varias ALTAS:

| ID | Panel | Sev | Hallazgo | Cierre aplicado en re-remediación |
|----|-------|-----|----------|-----------------------------------|
| S-001 / H-101 | rbac+cínico | **BLOQ** | FR-008 enumeraba *version antes que status* → oráculo 409/404 bajo carrera cruzada | FR-008 reescrito: precedencia **status>version** con orden de evaluación explícito (1 no-existe→404, 2 status fuera de ámbito→404, 3 sólo entonces version→409) |
| S-002 / H-102 | rbac+cínico | **BLOQ** | Trazabilidad FR-002 nombraba test "with 409" (contradice FR-002/SC-003=404) | → `should collapse non-reassignable status to generic 404 (no 409)` |
| T-002-REOPEN | theater | **BLOQ** | SC-008 reintroducía escape "umbral acotado O documentado/mitigado" | SC-008 reescrito: igualdad **byte a byte** por mismo camino, sin umbral ni escape |
| T-005/H-103 | theater+cínico | ALTA | Edge "orden sin asignatario" con "(a confirmar en clarify)" | Caso **real** (`onDelete:SetNull`), `from_assignee=NULL`, fixture huérfana |
| T-004/H-105 | theater+cínico | ALTA | SC-010 sin tamaño de muestra | N=**50 secuenciales**, BD caliente, warm-up descartado |
| H-104 | cínico | ALTA | FR-008 "cierra TOCTOU" absoluto sin documentar residual destino | Residual best-effort documentado → **BL-063** |
| H-108 | cínico | ALTA | Sin escenario de carrera reasignación↔transición FSM | **Escenario 9** + SC-004(b) |
| S-003 | rbac | ALTA | Saneo PII de `reason` sin mecanismo (auditoría inmutable) | Residual explícito heredado → **BL-055/BL-051** |
| S-006 | rbac | MEDIA | Timing entre 4 causas de 422 | Residual documentado → **BL-064** |
| H-106/H-107 | cínico | MEDIA | Migración `event_type` sin DEFAULT/backfill; reconciliación 002b delegada | DEFAULT+backfill en Key Entities; reconciliación → **BL-065** |
| S-005 | rbac | MEDIA | `If-Match` no reconciliaba precedencia | FR-012: hereda precedencia status>version |

## Re-entrada #2 (2026-07-12): **PASS** — **0 BLOQUEANTES** (panel valida la remediación)

Panel `revisor-cinico` + `auditor-spec-theater` + `revisor-rbac-seguridad`: **APROBADA × 3**. Todos los
hallazgos de la re-entrada #1 verificados como **cerrados en el texto**. Hallazgos nuevos (no bloqueantes),
cerrados o registrados en esta ronda:

- **ALTA** H-201 (FR-005 referenciaba un `assigned_to` "version-matched" inexistente en ese punto del orden):
  reescrito — comparación contra el `assigned_to` leído en la visibilidad de FR-004; consistencia final la da
  la guarda atómica de FR-008. **Cerrado.**
- **ALTA** T-001 (`trim()` no elimina caracteres de control): FR-006 exige ≥1 carácter imprimible (regex
  `\p{Cc}`/`\p{Cf}`) y conteo en **code points**. **Cerrado** (cierra también T-002 unidad de longitud).
- **MEDIA** T-003 (3ª vía del 404 sin instanciar): SC-008 verifica las **tres** vías byte a byte. **Cerrado.**
- **MEDIA** S-007 (FR-012 combinado sin test): US2 escenario 3 + fila de trazabilidad. **Cerrado.**
- **MEDIA** H-202 (origen de `expectedVersion` en flujo base): explicitado en FR-008 (relectura server-side).
  **Cerrado.**
- **MEDIA** H-203 (backfill sin test): fila de trazabilidad "Migración (OrderAudit)". **Cerrado.**
- **MEDIA** H-204 (BL-065 no materializado; 002b aún contradice): **registrado** como deuda de gobernanza
  BL-065; salvaguarda real = test de arquitectura de FR-007. **Diferido con tracking.**
- **BAJA** H-205 (residuales BL-063/064 honestos), H-206 (método/ruta a confirmar en plan), S-008 (accesos
  denegados = BL-002 pre-existente): **diferidos con tracking**, ninguno bloqueante.

**Veredicto G1: PASS (spec-freeze).** 0 BLOQUEANTES. Se avanza a `/speckit-plan`. Deudas nuevas: BL-063/064/065
en `docs/backlog.md`.
