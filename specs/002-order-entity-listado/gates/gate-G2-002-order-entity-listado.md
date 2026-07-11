# Gate G2 — 002a Order + listado por rol (tras /speckit-analyze)

**Fecha:** 2026-07-11 · **Panel acumulativo:** revisor-cinico, auditor-spec-theater, revisor-rbac-seguridad,
revisor-consistencia · **Criterio:** 0 BLOQUEANTES.

## Veredicto: APROBADA ✅ (0 BLOQUEANTES)

Los 4 revisores reportaron **0 bloqueantes**. `/speckit-analyze` previo: 0 CRITICAL/HIGH, 0 fuga de 002b,
constitución alineada. Ningún bloqueante que remediar → G2 pasa.

## ALTA/MEDIA cerrados proactivamente (no bloqueaban, cerrados para no arrastrar a G3)

| Hallazgo | Revisor | Cierre |
|----------|---------|--------|
| IDOR mismo-estado (technician1 vs technician2 `pending_review`) | rbac S-002 | seed technician2 + T009 asevera exclusión |
| 403 vía JWT forjado (inseguro) | rbac S-005 / cínico H-002 | T010 → **unit** sobre `authorize` (rol ausente/malformado/fuera de allowlist) |
| rol ausente/malformado → 403 | rbac S-001 | T010 unit default-deny |
| tiebreak `id` sin datos que lo obliguen | cínico H-001 | seed con `created_at` idéntico + T009 |
| lista vacía sin usuario de alcance vacío | cínico H-003 | seed technician3 sin activas |
| invariante `assigned_to` null en `pending_review` | cínico H-005 | invariante extendido en seed |
| validación de contrato podría 400 en query | cínico H-004 | T014: validación body/response, query ignorada |
| FR-011 sin traza | consistencia K-001 | T008 asevera error contract + correlation-id |
| auditoría "en 002" vs 002a/002b | consistencia K-002 | nota en plan (CREATE TABLE ≠ retrofit) + BL-048 |
| paginación cursor (convención) | consistencia K-003 | excepción documentada en plan |
| `version` sin `minimum:0` | consistencia K-004 | añadido al contrato |
| T011 mecanismo "no inline" ambiguo | spec-theater T-001 | spy de `orderScopeFor` |
| orden 401→403 sin caso combinado | spec-theater T-002 | T010 integration token inválido→401 |
| redacción de logs test vacuo | spec-theater T-003 / rbac S-006 | T016 fuerza log (feliz+error) |
| migración reversible sin verificar | spec-theater T-004 | T001 verifica up→down |
| mensaje 403 enumera roles | rbac S-004 | spec FR-006 → mensaje genérico |

Diferidos (fuera de alcance, backlog): minimización PII por rol (BL-046), aislamiento por equipo (BL-049),
reconciliación textual del constitution (BL-048).

**Estado: G2 PASA.** Diseño de 002a congelado. Siguiente: `/speckit-implement` (TDD en Docker) → **G3**.
No se re-lanza el panel: no había bloqueantes; los cierres fueron mejoras de robustez de tareas/seed.
