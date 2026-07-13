# Gate G3 — 004-orden-reasignacion (implementación)

**Fase**: G3 (tras `/speckit-implement`) · **Panel**: `revisor-implementacion` + `revisor-rbac-seguridad`
**Fecha**: 2026-07-13 · **Base**: G1 PASS + G2 PASS (spec magra)

## Veredicto: **PASS** — 0 BLOQUEANTES

Verificación determinista (sin IA → sin promptfoo, N/A): **`vitest run` 5/5 corridas → 216 passed | 1 skipped
| 0 failed**; `tsc` limpio; `eslint --max-warnings=0` limpio; cobertura **95.51% stmts / 91.42% branches /
100% funcs** (write-side dominio 100%; reassign.ts 96%; gate por capa superado). Perf SC-010 verificado
standalone (`RUN_PERF=1` → p95 < 300 ms).

### revisor-rbac-seguridad — **APROBADA** (0 huecos)

Orden 401→403 `FORBIDDEN_ROLE`→404 (uuid malformado cortado antes de BD; visibilidad después)→422 body→422
`INVALID_ASSIGNEE`→200 correcto en el código; 422 inalcanzable para orden no visible; actor sólo del token;
404 byte-idéntico; atomicidad real (SELECT FOR UPDATE + UPDATE condicional `IS DISTINCT FROM` + auditoría en la
tx); `from_assignee` = valor previo; `reason` redactado; 500 sin filtrar Postgres; trigger append-only + CHECK
intactos. Sin escalada ni fuga entre roles.

### revisor-implementacion — **APROBADA** (0 BLOQUEANTES)

Código cumple FR-001..009 / SC-001..010 y el contrato; `applyTransition`/002b intacto. Hallazgos (todos
no-bloqueantes) y su cierre:

- **I-001 (ALTA) — suite intermitente**: CERRADO. Era carrera de datos + contención de conexiones entre
  ficheros sobre la BD compartida. Fix: `vitest fileParallelism:false` (serie), fixtures de 004 en técnicos
  dedicados (no contaminan las listas de 002a), login único, y test de perf gated `RUN_PERF=1`. **5/5 corridas
  verdes deterministas**.
- **I-002 (MEDIA) — 500 vía HTTP sin test**: CERRADO. Nuevo `tests/unit/reassign-handler.spec.ts` ejercita el
  catch-all → 500 `INTERNAL` genérico sin filtrar SQLSTATE/constraint/query.
- **I-003 (BAJA) — reason-no-en-logs vía HTTP**: aceptado documentado. El mecanismo `REDACT_PATHS`
  (`req.body.reason`/`*.reason`/`err.reason`) está unit-verificado y la no-fuga en el **cuerpo** del 422 tiene
  test; la captura de stream de logs vía HTTP queda como hardening (mismo criterio transversal del repo).
- **I-004 (BAJA) — sin commit "rojo" aislado**: desviación de proceso **recurrente y aceptada** (precedente
  002b `7eb180b`): implementación+tests en un commit. No bloquea (los tests cubren los AC y G3 los ejecuta).

**Deudas/stretch (no MVP, XV)**: BL-001 (If-Match/409), BL-063/064/066 (hardening), BL-067 (gobernanza XI),
BL-002/051/055 (heredados), perf SC-010 como CI/manual (`RUN_PERF=1`).

**004 lista para merge a `main`.**
