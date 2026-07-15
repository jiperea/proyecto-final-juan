# Gate G3 — 020-front-architecture (tras `/speckit-implement` + tests)

**Fecha**: 2026-07-15 · **Fase**: G3 (implementación vs spec, acumulativo sobre G1+G2) · **Panel**: `revisor-implementacion` + `revisor-rbac-seguridad`. Sin `promptfoo` (feature sin componente IA ni Success Criteria de IA).

## Veredicto: ✅ **PASS** — 0 BLOQUEANTES

`revisor-implementacion` APROBADA_CON_COMENTARIOS · `revisor-rbac-seguridad` APROBADA_CON_COMENTARIOS.

## Evidencia de implementación (verificada)

- **3 reglas `enforced`** activas en `frontend/.eslintrc.cjs`: (g) `no-restricted-syntax` ExportDefaultDeclaration,
  (b) `react-hooks/exhaustive-deps: error`, (j) `no-restricted-imports` de `apiFetch` — acotadas a `src/`.
- **FR-007/SC-003**: `frontend/tests/lint-fixtures/` (1 fixture por regla enforced) + `lint-fixtures.test.ts`
  (ESLint programático) → **3/3** casos negativos detectados.
- **FR-010/SC-006 + FR-005a/SC-002**: `front-governance.test.ts` verifica doc↔config y cupo/formato de
  disables (0 disables de reglas FE-6).
- **Baseline real: 0 fixes de producción** — `git diff --stat develop -- frontend/` toca solo `.eslintrc.cjs`,
  `tsconfig.json`, `package*.json` y tests nuevos; **0 ficheros de `src/`**, 0 bajo `backend/`/`contracts/`/
  `src/domain/` (SC-005).
- **Gates verdes (SC-004)**: `tsc` · `eslint` · `stylelint` · `build` · **vitest 246/246** (sin regresión).
- **Invariante RBAC (FR-008a)**: 0 ficheros RBAC-sensibles modificados; (j) restringe solo `apiFetch` (el tipo
  `ApiError` sigue libre → patrón 403↔404 anti-enumeración intacto). 0 `eslint-disable` sobre RBAC.

## Hallazgos (todos MEDIA, no bloqueantes)

| ID | Tema | Resolución |
|----|------|-----------|
| I-002 | Reglas (b)/(d)/(f) con nivel compuesto (FR-002a pide "exactamente uno") | ✅ Corregido: nivel primario único en cabecera + nota de mecanización parcial en el cuerpo |
| S-001 | El gate RBAC no tenía shell para `git diff` literal | ✅ Confirmado por el hilo principal: `git diff --stat develop` toca solo tooling+tests, 0 `src/` |
| I-001 | No hubo commit "rojo" separado de T005 (disciplina TDD) | ⚠️ Aceptado: enforcement verificado hoy (test verde); feature de gobernanza sin producción tocada. Nota para futuras features: mantener el commit test-en-rojo separado |

## Nota de proceso

Aplicada la lección de G1/G2 (`gate-remediation-spiral`): remediación 1:1, sin acumular; **simplificación
estructural** clave en G1 (invariante conservador RBAC en vez de maquinaria de snapshot) que mantuvo el
implement mínimo (**0 fixes de producción**). Convergencia: G1 8 pases · G2 2 pases · G3 1 pase.

> **020-front-architecture lista para PR a `develop`.**
