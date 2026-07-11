# Gate G2 (consistencia + regresión G1) — 003-order-fsm-audit (002b)

**Fecha**: 2026-07-11 · **Disparado por**: `after_analyze` (hook mandatorio) tras `/speckit-analyze`, con
plan/research/data-model/tasks **regenerados vía skills** (remediación de G2 + G1 re-entrada APROBADA).
**Panel**: revisor-consistencia (G2) + revisor-cinico (regresión G1) + revisor-rbac-seguridad (regresión G1).
**Criterio**: 0 BLOQUEANTES.

## Veredictos (0 BLOQUEANTES en los tres)

- **revisor-rbac-seguridad**: APROBADA_CON_COMENTARIOS — 1 MEDIA (S-001: propagar el contrato `actor_id`
  server-side a research/data-model/tasks). Verificó que los 4 cierres de G1 (FR-009 body uniforme, actor_id
  server-side, trigger no-REVOKE, GUARD_UNMET/ACTOR_INVALID sin fuga) están coherentes; T010 testea el trigger
  con el rol de runtime (no reintroduce REVOKE-verde-falso).
- **revisor-consistencia**: REQUIERE_CAMBIOS (0 bloq) — 2 ALTA (K-001 colisión numérica carpeta `003` vs
  roadmap `003/004/005`; K-006 falta reconciliar Constitution XI campo evidencia) + 4 MEDIA (colisiones de IDs
  de hallazgo). Cobertura FR-001..009 / SC-001..006 completa; orden de clasificación y trigger unificados.
- **revisor-cinico** (regresión): REQUIERE_CAMBIOS (0 bloq) — confirmó que **NO** reaparecen los 3 bloqueantes
  previos (draft→assigned, SC-002 infalsable, oráculo de enumeración); 3 ALTA (H-001 higiene de IDs incompleta;
  H-003 best-effort→semántica de reintento; H-004 FR-009 "autorizado" vs TOCTOU) + 3 MEDIA.

## Cierres aplicados (todas las ALTAS + MEDIAS clave)

- **cínico-H-004** → FR-009(b): `GUARD_UNMET`→**404** si la visibilidad del actor depende de la pertenencia
  (técnico desasignado no reabre oráculo); →**403** sólo si la visibilidad es independiente (supervisor/dispatcher).
  "Autorizado" se evalúa con el dato fresco de la guarda atómica.
- **cínico-H-003** → FR-009: nota de reconciliación best-effort→reintento (409 re-leer/retry; 422/403/404
  terminal; el cliente re-lee ante no-2xx → autocorrige). Riesgo residual aceptado.
- **consist-K-001** → Assumptions: reconciliación numeración física (carpeta 003 = "002b"; consumidoras
  003/004/005 = carpetas 004/005/006) — referenciadas por nombre.
- **consist-K-006** → Assumptions + BL-057: reconciliación Constitution XI (campo evidencia se añade en 004;
  desviación temporal documentada, análoga a BL-050).
- **cínico-H-005** → FR-009: `ACTOR_INVALID` inalcanzable por request (actor_id server-side) → 500 genérico si
  ocurriera, fuera del contrato de exposición.
- **Higiene de IDs (consist-K-002/03/04/05 + cínico-H-001/H-002)** → **leyenda de espacios de nombres** (IDs
  scoped por panel/pasada, autoritativos en los informes de gate) + arreglo de typos (guion→dos puntos,
  prefijo `cínico-` normalizado) + corrección de la doble acepción de `G2:H-008` (mantenimiento = `G1:H-008`).
- **rbac-S-001** → T019 + data-model: contrato `actor_id` server-side propagado a los artefactos derivados.
- **cínico-H-006** → T020: verificación de que el `down` de la migración corre limpio.

**Veredicto final G2**: **APROBADA** (0 BLOQUEANTES; ALTAS cerradas en spec/artefactos; MEDIAS de defensa en
profundidad y campo-evidencia en backlog BL-055/056/057 con rationale). Listo para `/speckit-implement`
(TDD Docker) → **G3**.
