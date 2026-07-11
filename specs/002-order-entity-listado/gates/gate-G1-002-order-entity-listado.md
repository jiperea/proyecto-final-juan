# Gate G1 — 002a Order + listado por rol (tras /speckit-clarify)

**Fecha:** 2026-07-11 · **Panel:** revisor-cinico, auditor-spec-theater, revisor-rbac-seguridad ·
**Criterio:** 0 BLOQUEANTES (spec-freeze).

## Ronda 1 — BLOQUEADA (1 bloqueante)

- **H-001 (BLOQUEANTE)**: entidad `Order` sin columna `version` que la Constitution v1.5.1 exige diseñar ya.
- ALTA: FR-006 no testeable (todos los roles listan) · technician sin acotar por estado · `draft` invisible
  sin declarar · falta contrato/auth del endpoint · tiebreak de orden.
- MEDIA: PII en `title`/`description` + `assigned_to` (UUID vs nombre) · query params · política centralizada
  · SC "uniforme"/volumen sin cuantificar.

**Validó XV**: hasta un slice pequeño escondía un bloqueante + varias ALTA, cazados en G1 (barato), no en G3.

## Remediación (en la spec, antes de avanzar)

FR-010 + `version`; FR-006 default-deny por allowlist; FR-002 technician acotado a activas; `draft`/`closed`
invisibles declarados; FR-007 `assigned_to` UUID opaco; FR-012 tiebreak `id`; FR-014 Bearer + contract-first;
FR-015 params no amplían alcance; FR-016 `orderScopeFor(role,userId)` centralizada y verificable; FR-017 PII
no logueada; SC-002 ≥30 órdenes; SC-003 401 uniforme. Diferidos → BL-046..049.

## Ronda 2 (re-verificación) — APROBADA ✅ (0 BLOQUEANTES)

| Revisor | Ronda 1 | Re-run |
|---------|---------|--------|
| revisor-cinico | BLOQUEADA (H-001) | ✅ APROBADA (cierres verificados; 4 mejoras menores integradas) |
| auditor-spec-theater | APROBADA c/c | ✅ APROBADA (T-001..004 cerrados) |
| revisor-rbac-seguridad | requiere cambios (0 bloq) | ✅ APROBADA (S-001..005 cerrados) |

Mejoras de la ronda 2 integradas: AS-1 exige excluir `closed`/`draft` propias; FR-016 firma `(role,userId)` +
método de verificación; `closed` invisible e invariante `assigned_to` declarados. MEDIA residuales → backlog.

**Estado: G1 PASA.** Spec congelada. Siguiente: `/speckit-checklist` → `/speckit-plan`.
