# Gate G2 — Propuestas de remediación (agente `remediador`)

> Generado por `remediador` (propone, NO aplica — separación de funciones). Revisión humana pendiente.
> Al aprobar, se aplican **vía skills** (`clarify`/`plan`/`tasks`) o edición de docs propios, y se **re-ejecuta G2**.

## Orden sugerido: H-001 → S-001 → S-002 → H-002 → S-003 → H-003 → K-001 → T-001 → H-004 → K-002 → K-003

| # | ID | Sev | Artefacto | Cambio (esencia) | Skill |
|---|----|-----|-----------|------------------|-------|
| 1 | **H-001** | 🔴 BLOQ | research D3 (pto 4) + tasks T060 | El fallback-a-BD consulta **también `User.disabled_at`** (no solo familia); `SessionStatePort.isUserActive` en fallback pega a BD. T060 añade caso "usuario disabled sigue cortado (401) tras reinicio/cache-miss". | plan + tasks |
| 2 | **S-001** | 🟠 ALTA | tasks T017/T020 + contrato `ErrorResponse` + T052 | Añadir `password` a la redacción de pino (`req.body.password`); `details` con allowlist (sin `additionalProperties:true` libre) que **excluye password**; test de que 422 de login no incluye el valor de password. *(Nota remediador: el informe citó T062 por error = lockout-reset; el test de details es **T052**.)* | plan (contrato) + tasks |
| 3 | **S-002** | 🟠 ALTA | research D8 + tasks T015/T019 | Config Zod con chequeo **pairwise-distinct** de `JWT_SECRET`/`CSRF_HMAC_SECRET`/`LOCKOUT_HMAC_SECRET`; aborta nombrando el par en conflicto. T015 añade el caso. | plan + tasks |
| 4 | **H-002** | 🟠 ALTA | spec FR-004c | Aclarar **dos regímenes sin contradicción**: validación per-request (hot path) = caché+fallback; `refresh` (no hot path) = BD autoritativa; mismo criterio, distinto acceso al dato. | clarify |
| 5 | **S-003** | 🟡 MEDIA | spec FR-018 | "Sesión válida" incluye disabled/familia (FR-004c) → se evalúa **antes** que CSRF (no solo validez cripto del token). | clarify |
| 6 | **H-003** | 🟡 MEDIA | data-model + tasks T014/T044 | Añadir **probe-C** `in_scope=[dispatcher]` (404-por-alcance para **supervisor**) → cobertura simétrica. | plan + tasks |
| 7 | **K-001** | 🟡 MEDIA | quickstart | Añadir `LOCKOUT_HMAC_SECRET` al bloque de `.env`. | doc propio |
| 8 | **T-001** | 🟡 MEDIA | threat-model | Añadir **rúbrica objetiva** de severidad (BLOQUEANTE/ALTA/MEDIA) antes de la matriz; revisar filas. | doc propio |
| 9 | **H-004** | 🟡 MEDIA | spec FR-005 | **Opción A**: exigir paridad de **timing** en el 401 de refresh (como login). **Opción B (rec.)**: backlog explícito (BL) por coste/riesgo sobre SC-005. | clarify o backlog |
| 10 | **K-002** | 🟡 MEDIA | quickstart | Fixtures probe = 3 casos + inexistente (alinear con H-003). | doc propio |
| 11 | **K-003** | 🟡 MEDIA | data-model (mapa entidad→FR) | Añadir **FR-002b** a `User` y `LoginAttempt`. | doc propio |

## Estado
**GATE G2 = FAIL** (1 bloqueante). Avance **detenido**: no se aplica ni se commitea hasta resolver H-001
(mínimo) + ALTAS, y **re-ejecutar `/speckit-analyze` → G2** hasta 0 bloqueantes. Las propuestas 4/5/9 tocan
spec → re-disparan **G1** (spec-freeze); 1/2/3/6 → plan+tasks; 7/8/10/11 → docs propios.
