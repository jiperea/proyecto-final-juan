# Gate G2 — 020-front-architecture (tras `/speckit-analyze`)

**Fecha**: 2026-07-15 · **Fase**: G2 (consistencia spec↔plan↔tasks, acumulativo sobre G1) · **Panel**: `revisor-consistencia` + regresión `revisor-cinico`, `auditor-spec-theater`, `revisor-rbac-seguridad`.

## Veredicto final: ✅ **PASS** — 0 BLOQUEANTES

Pase 1: los 4 agentes **REQUIERE_CAMBIOS pero 0 bloqueantes** (huecos de completitud de `tasks.md` +
trazabilidad, no de diseño). Pase 2 (verificación): `revisor-consistencia` **APROBADA, `huecos: []`**.

## Hallazgos (pase 1) y remediación

| ID(s) | Sev | Tema | Estado |
|-------|-----|------|--------|
| K-001 / H-007 / T-002 | ALTA | Tabla de trazabilidad de spec.md con placeholders `T0xx` | ✅ IDs reales T001–T010 |
| K-002 / H-004 / S-001 | ALTA | Grep RBAC de FR-008a sin tarea ejecutable | ✅ T008 lo ejecuta sobre el diff final + AST + tests de rol nombrados |
| H-001 / T-001 | ALTA | T005 no dependía de T001; nº de fixtures ≠ conjunto enforced | ✅ T005 depende de T001; fixtures = conjunto enforced exacto |
| H-002 | ALTA | "MVP" sugería que US3 (no-regresión) era opcional | ✅ MVP = orden; US3 obligatoria para merge |
| H-006 | ALTA | T008 no re-aplicaba fixes sobre base limpia ni re-medía agregado | ✅ T008 re-aplica en base limpia + re-mide `git diff --numstat` |
| K-003 / H-005 / S-002 | MEDIA | Cupo/formato/prioridad de `eslint-disable` sin verificación | ✅ T007 lo comprueba (≤3, `-- <razón>` ≥15, prioridad RBAC) |
| H-003 | MEDIA | Reglas no mecanizables sometidas a un baseline inexistente | ✅ T001 las marca `guía` sin baseline |
| K-004 | MEDIA | `checklists/requirements.md` decía "9 reglas" | ✅ 10 reglas (a)–(j) |

## Nota de proceso

Se aplicó la lección de G1 (`gate-remediation-spiral`): remediación **1:1** de cada hallazgo (añadir el paso
de tarea que faltaba), **sin acumular maquinaria nueva**, y verificación con un solo pase del lente propio de
G2. Convergió en 2 pases (vs 8 de G1).

> Avance autorizado a `/speckit-implement` + G3. `docs/traceability.md` se actualiza en T010 (implement).
