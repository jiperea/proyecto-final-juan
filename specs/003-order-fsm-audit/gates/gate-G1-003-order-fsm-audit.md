# Gate G1 — 002b Order FSM + auditoría append-only (tras /speckit-clarify)

**Fecha:** 2026-07-11 · **Panel:** revisor-cinico, auditor-spec-theater, revisor-rbac-seguridad ·
**Criterio:** 0 BLOQUEANTES (spec-freeze).

## Ronda 1 — BLOQUEADA (2 bloqueantes, ambos del cínico)

- **H-001 (BLOQUEANTE)**: `reason` con posible **PII** grabado para siempre en `OrderAudit` (append-only, sin
  purga) sin dueño verificable de la sanitización (Const. XI). Solo se prohibían logs, no el almacenamiento.
- **H-002 (BLOQUEANTE)**: la constitution clasifica la **concurrencia optimista (If-Match→409) como *stretch***,
  pero 002b la hacía **obligatoria** (FR-003/008 + SC-002) → contradicción documental.
- ALTA/MEDIA: append-only sin enforcement (H-005/S-001/T-001), `reason` en `details`/`agent_action` (S-002),
  bypass de `status` (H-004), atomicidad no testeable sin mock (H-006), `OrderAudit` no soporta accesos
  denegados (H-003), `draft→assigned` sin llamador (H-007), order/actor inexistentes (H-008/H-009),
  sin cancelación/límite (H-010), precedencia 422/409 (H-011).

**Validó XV una vez más**: la maquinaria core escondía 2 contradicciones con la constitution, cazadas en G1.

## Remediación (en la spec)

Saneo de `reason` asignado al llamador + veto en logs/errores (FR-008); concurrencia reframed a **correctness
(no lost-update) mandatory** vs **If-Match→409 stretch** (SC-002/FR-003, reconciliación → BL-050); append-only
**a nivel de BD** (FR-005); único punto de escritura de `status` (FR-006); atomicidad testeable vía `actor_id`
inexistente (SC-004); `OrderAudit` desacoplado de accesos denegados (BL-052); `draft→assigned` fuera;
`ORDER_NOT_FOUND` (404); precedencia determinista; sin cancel/límite (BL-054). BL-050..054.

## Ronda 2 (re-verificación) — APROBADA ✅ (0 BLOQUEANTES)

| Revisor | Ronda 1 | Re-run |
|---------|---------|--------|
| revisor-cinico | BLOQUEADA (H-001,H-002) | ✅ APROBADA (bloqueantes + H-003..011 cerrados) |
| auditor-spec-theater | APROBADA c/c | ✅ APROBADA (T-001..003 cerrados) |
| revisor-rbac-seguridad | requiere cambios (0 bloq) | ✅ APROBADA (S-001/002/006 cerrados) |

Mejoras de ronda 2 integradas: `applyTransition` acepta **predicados de guarda de pertenencia** en el UPDATE
atómico (cierra TOCTOU para 003/004/005, H-012/S-004); clasificación de causa **best-effort** documentada
(H-013); `order_id` inexistente solo en FR-003 (H-014); BL-051 referenciado (S-005); "reutilizable" remitido a
FR-006 (T-001). MEDIA residuales → backlog.

**Estado: G1 PASA.** Spec de 002b congelada. Siguiente: `/speckit-plan` → `/speckit-tasks` → G2.
