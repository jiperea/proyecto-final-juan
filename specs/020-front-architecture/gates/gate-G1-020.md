# Gate G1 — 020-front-architecture (tras `/speckit-clarify`)

**Fecha**: 2026-07-15 · **Fase**: G1 (calidad de spec) · **Panel**: `revisor-cinico`, `auditor-spec-theater`, `revisor-rbac-seguridad`

## Veredicto final: ✅ **PASS** — 0 BLOQUEANTES (pase 8)

`revisor-cinico` APROBADA · `auditor-spec-theater` APROBADA (`huecos: []`) · `revisor-rbac-seguridad` APROBADA.

## Convergencia (8 pases, acumulativo)

| Pase | Resultado |
|------|-----------|
| 1 | FAIL — 1 BLOQ (FR-006 no falsable) + 6 ALTA + 8 MEDIA |
| 2 | 0 BLOQ; 2 ALTA nuevas + MEDIA (grietas de la propia remediación) |
| 3 | 1 BLOQ re-surgido (Clarifications/FR-003a/SC-003 incoherentes) + 2 ALTA + 1 MEDIA |
| 4 | 1 BLOQ (Assumptions sin propagar H-015) + 3 ALTA + MEDIA |
| 5 | 0 BLOQ; ALTA/MEDIA de determinismo fino |
| 6 | 1 BLOQ (snapshot ambiguo S-001) + ALTA + MEDIA |
| 7 | 1 BLOQ (SC-001 10 vs resto 9, inconsistencia introducida) + ALTA + MEDIA |
| **8** | **0 BLOQ — los 3 APROBADA** |

## Decisiones estructurales clave de la remediación

- **Baseline determinista (FR-003a)** con **umbral numérico ≤3 ficheros/≤10 líneas por regla** (y **≤6/≤20
  agregado**, FR-003b, medido sobre el diff final deduplicado `git diff --numstat`) → hace **falsable** la
  clasificación `enforced` vs `recomendación` de cada una de las **10 reglas candidatas (a)–(j)**. Método de
  conteo, orden canónico de desempate y reversión de mediciones definidos y reproducibles.
- **Invariante conservador RBAC (FR-008a)**: la feature **no modifica lógica de control de acceso**
  (inventario + fail-safe + grep objetivo + criterio de nodo AST; disable-o-degradar, nunca alterar el
  acceso). Sustituyó por **proporcionalidad (XV)** una maquinaria de snapshot que era autocontradictoria
  (origen de bloqueantes recurrentes).
- **Seguridad de la doc (FR-002b/FR-002c)**: la regla (h) declara que la UI **nunca** autoriza (backend
  único, Const. IV); la regla (c) distingue 401/403/404 con **excepción de anti-enumeración por recurso**
  (respeta el 404 de enmascaramiento del backend).
- **Test-fixture de lint en CI (FR-007/FR-007a)** con un caso negativo por regla `enforced`, aislado del run
  principal.

## Residuales aceptados (MEDIA, no bloqueantes — documentados, no diferidos en silencio)

- **H-033/H-029**: la coordinación de orden de merge 020→021 es una garantía de **proceso/roadmap**, no
  verificable por los gates de 020 (que terminan al mergear). Mitigado: 021 correrá el mismo eslint ya en
  `develop`. Riesgo bajo.
- **S-005**: cobertura de ramas de rol de los tests existentes → **deuda anotada** en baseline; no bloquea
  porque el invariante conservador no modifica lógica RBAC (no hay regresión que cubrir).
- **S-006**: la granularidad del grep (línea) vs el criterio AST (nodo) → resuelto declarando el grep como
  **red de seguridad** y el nodo AST como criterio **primario y suficiente**.

> Avance autorizado a `/speckit-checklist` → `/speckit-plan`. G1 acumulativo se re-ejecutará en G2.
