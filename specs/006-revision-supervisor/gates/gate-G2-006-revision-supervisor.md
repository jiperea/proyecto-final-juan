# Gate G2 · 006-revision-supervisor — Resumen

**Veredicto final: ✅ PASS (0 BLOQUEANTES)** · Fecha: 2026-07-13
**Panel acumulativo**: `revisor-consistencia` + regresión G1 (`revisor-cinico`). Foco: consistencia
spec↔plan↔tasks↔contrato↔roadmap.

Convergencia en **3 pases** (remediación vía re-ejecución de skills `/speckit-clarify`, `/speckit-plan`,
`/speckit-tasks` + edición de roadmap; **sin** hand-editing de artefactos SDD a lo bruto):

| Pase | Bloqueantes | Acción |
|------|-------------|--------|
| 1 | 1 (K-001 guard 409-antes-de-404) + 2 ALTA + 2 MEDIA | Remediación: guard plegado en el UPDATE (`evidence:{some:{}}`), 404 antes que 409; motivo 1..1000 tras saneo (Zod cota cruda 4000); T020 ciclo cruzado; BL-071 |
| 2 | 2 (H-001 precedencia handler, H-002 atomicidad Prisma) + 2 ALTA + 1 MEDIA | Remediación: handler payload-antes-de-recurso (T013); atomicidad SQL + fallback `$executeRaw` (D8); rama por-defecto fail-safe del clasificador; BL-071 al roadmap; drift del plan barrido |
| 3 | **0** + 1 ALTA + 3 MEDIA (cerrados) | H-005 simetría approve (T012); H-006 T020 no sobre-afirma atomicidad; H-007 garantía dura por diseño (T018), query-log best-effort; K-001 residuo "(COUNT)" en data-model |

## Cierres clave

- **K1/H-001 (no-enumeración)**: existencia de evidencia como filtro de relación **dentro** del UPDATE
  condicional; `classifyReviewGuard` clasifica **404 (no visible) antes que 409 (EVIDENCE_MISSING)** desde el
  snapshot re-leído; rama por-defecto → 404 fail-safe.
- **H-001 (precedencia)**: handler valida `decision`/`reason` (dominio, `INVALID_REASON`) **antes** del formato
  de `orderId` (404) — payload antes que recurso (FR-009), con test cruzado en reject (T017) y approve (T012).
- **K2 (longitud motivo)**: 1..1000 medido **tras `sanitizeReason`** en dominio (`INVALID_REASON`); Zod sólo
  cota cruda ≤4000 (`VALIDATION_ERROR`).
- **H-002 (atomicidad)**: `UPDATE … WHERE … EXISTS(…)` en una sentencia; fallback `$executeRaw`; garantía dura
  por comportamiento (T018), no por conteo de líneas de log.
- **H-004 (dependencia 006→005)**: T020 asevera la postcondición `evidenceCount≥1` tras el reenvío (alarma de
  regresión), sin sobre-afirmar la atomicidad de 005.
- **BL-071**: reconciliar 003 FR-006 (invariante write-side = carpeta, no `applyTransition`) trazado en roadmap.

## Seguimiento (no bloqueante)

- BL-070 (#010 read-side + enmienda XI), BL-071 (003 FR-006), BL-051 (cifrado at-rest `reason`), #008/#009.

Cobertura: 13 FR / 6 SC → 26 tareas, 100%. Artefactos: `gate-G2-006-revision-supervisor.json` (hallazgos pase 1).
