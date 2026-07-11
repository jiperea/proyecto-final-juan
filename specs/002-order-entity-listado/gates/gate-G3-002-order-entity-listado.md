# Gate G3 — 002a Order + listado por rol (tras /speckit-implement)

**Fecha:** 2026-07-11 · **Panel acumulativo:** revisor-implementacion, auditor-spec-theater,
revisor-rbac-seguridad, revisor-consistencia · **Criterio:** 0 BLOQUEANTES.

## Veredicto: APROBADA ✅ (0 BLOQUEANTES)

133 tests verde (110 de 001 + 23 de 002a), typecheck + eslint limpios, OpenAPI válido, sin regresión en 001.
Los 4 revisores reportaron **0 bloqueantes**. Funcionalidad sólida: `orderScopeFor` única fuente, filtrado
por rol en backend no ampliable, IDOR mismo-estado bloqueado, default-deny 403, `assigned_to` UUID opaco,
orden determinista, fail-closed. Sin fuga de 002b.

## ALTA cerrados en la remediación (no bloqueaban; cerrados para no arrastrar)

| Hallazgo | Revisor | Cierre |
|----------|---------|--------|
| **Redacción de logs no cubría la forma array real** `{orders:[{title}]}` → PII filtrable | implementacion I-001 | patrones `orders[*].title/description` + test con la forma real (verificado) |
| Architecture test evadible (solo buscaba `pending_review`, no la rama dispatcher) | spec-theater T-002 | detecta cualquier literal de estado inline + verifica uso de `orderScopeFor` |
| `list-orders` test `toHaveLength` en vez de identidad | spec-theater T-005 | `toBe` pass-through exacto |
| Contrato no declaraba 503 fail-closed | implementacion I-002 | `503` añadido a `/orders` |
| BL-038 no referenciaba 002a/SC-002 | consistencia K-001 | BL-038 incluye T017/002a |
| T008/quickstart decían contract 403 (es unit) | consistencia K-002 | corregido |
| data-model `OrderScope` desalineado | consistencia K-003 | forma real `{statuses, assignedTo}` |
| T013 ruta authorize.ts (real require-role.ts) | consistencia K-004 / impl I-005 | corregido |
| T011 spy vive en list-orders.spec | consistencia K-005 | trazado |
| traceability sin FR-013/FR-014 | consistencia K-006 | filas añadidas |

## MEDIA/BAJA aceptados (backlog / decisión de diseño)

- Minimización de PII por rol (title/description completos a gestores) → BL-046.
- Alcance global de supervisor/dispatcher (sin equipo/región) → BL-049 / multi-tenant fuera de alcance.
- Observabilidad del catch genérico del handler (S-001) → mejora futura.
- Perf SC-002 (T017) → BL-038.
- `csrf-order.spec.ts` = "orden de comprobación CSRF" de 001 (no Order); nombre correcto en su contexto.

**Estado: G3 PASA.** Ciclo SDD de 002a COMPLETO (G1 ✅ + G2 ✅ + G3 ✅). Lista para merge.
No se re-lanza el panel: 0 bloqueantes; los ALTA se cerraron y se verificaron por test (redacción array probada).
