# Branch protection — checks obligatorios (FR-P09 / AC-3)

> **Por qué este fichero existe.** El PR-gate (`pr-validation-back.yml`, `secrets-scan.yml`, …) solo
> *produce* checks; que esos checks **bloqueen el merge** depende de la configuración de branch protection
> de GitHub (Settings → Branches / Rulesets), que **no es código** en un repo privado del plan Free (no hay
> App/OIDC que la aplique como IaC). Este documento **versiona la configuración esperada** para que sea
> revisable, auditable y reproducible a mano. Es la fuente de verdad de qué debe estar marcado como
> *required*; si un nombre de job cambia en un `.yml`, **hay que actualizar aquí y en Settings**.

## Ramas protegidas: `main` y `develop`

Reglas comunes (ambas ramas):

- ✅ **Require a pull request before merging** (sin push directo). Cierra el hueco de "push directo a main
  sin gate" (revisión DO-3, D-004).
- ✅ **Require status checks to pass before merging** + **Require branches to be up to date**.
- ✅ **Do not allow bypassing the above settings** (ni admins) — coherente con XIII (sin excepción
  automática) y FR-P09 (sin vía de excepción).

### Status checks requeridos (nombres exactos de los jobs)

| Check (job name) | Workflow | FR |
|---|---|---|
| `gitleaks (todo el repo)` | `secrets-scan.yml` | FR-P04 |
| `Guardián de Constitución + trazabilidad` | `pr-validation-back.yml` | FR-P07, FR-P08 |
| `lint · typecheck · test (Postgres)` | `pr-validation-back.yml` | FR-P02 |
| `Contratos (Spectral + oasdiff)` | `pr-validation-back.yml` | FR-P03 |
| `Imagen backend + Trivy` | `pr-validation-back.yml` | FR-P05 |

> **Front (DO-6):** al añadir `pr-validation-front.yml`, sumar aquí sus jobs (`lint`, `typecheck`+codegen,
> `test`+axe, `build`) como checks requeridos (FR-P06).
>
> **Nota sobre `paths:`** — los checks de `pr-validation-back.yml` solo se ejecutan (y por tanto solo se
> exigen) en PRs que tocan `backend/**`/`contracts/**`. `secrets-scan.yml` **no** tiene filtro `paths:`, así
> que gitleaks se exige en **todos** los PRs. Al marcar checks requeridos, verifica el comportamiento de
> "required check that didn't run" de tu configuración (Rulesets modernos lo tratan como *skipped→neutral*).

## Cómo aplicarlo (manual, hasta que haya IaC)

`Settings → Branches → Add branch ruleset` para `main` y `develop`, marcando lo anterior. Verificación
(AC-3): abrir un PR con un test roto o un secreto de prueba → el merge debe quedar **bloqueado**.
