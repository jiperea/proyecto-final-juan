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
| `Guardián de Constitución + trazabilidad` | `pr-validation-back.yml` **y** `pr-validation-front.yml` | FR-P07, FR-P08 |
| `Code review registrado` | ambos PR-gates | FR-010 / FR-P22 |
| `lint · typecheck · test (Postgres)` | `pr-validation-back.yml` | FR-P02 |
| `Contratos (Spectral + oasdiff)` | `pr-validation-back.yml` | FR-P03 |
| `Imagen backend + Trivy` | `pr-validation-back.yml` | FR-P05 |
| `lint · typecheck · test · build` | `pr-validation-front.yml` | FR-P06 |
| `Imagen frontend + Trivy` | `pr-validation-front.yml` | FR-P05 |

> **Guardián-agente (opt-in):** el check `Guardián de Constitución (agente · opt-in)` **solo** márcalo como
> requerido **si** has activado el secret `ANTHROPIC_API_KEY` (FR-009). Sin la key, el job pasa en verde sin
> llamar a la API; marcarlo requerido sin la key no aporta (siempre verde).
> **Nota `paths:`** — los checks de un componente solo se exigen en PRs que lo tocan; en Rulesets modernos un
> required check que no se dispara cuenta como *skipped→neutral* (no bloquea). Verifícalo en tu config.
>
> **Nota sobre `paths:`** — los checks de `pr-validation-back.yml` solo se ejecutan (y por tanto solo se
> exigen) en PRs que tocan `backend/**`/`contracts/**`. `secrets-scan.yml` **no** tiene filtro `paths:`, así
> que gitleaks se exige en **todos** los PRs. Al marcar checks requeridos, verifica el comportamiento de
> "required check that didn't run" de tu configuración (Rulesets modernos lo tratan como *skipped→neutral*).

## Tag ruleset: releases solo desde `main` (FR-P09 / cadena de custodia)

`ci-main-back.yml` libera (imagen semver + GitHub Release) al empujar un tag `vX.Y.Z`. Para que un tag no
sea una **puerta trasera** que se salte el PR-gate:

- **Defensa en código (ya implementada):** el job `ci` verifica `git merge-base --is-ancestor <sha> main`
  y aborta si el commit etiquetado no está en `main` (no pasó el PR-gate). Es la barrera efectiva.
- **Defensa en configuración (aplicar a mano):** `Settings → Rules → Rulesets → New tag ruleset` para el
  patrón `v*`, restringiendo **quién** puede crear/empujar esos tags (idealmente solo maintainers/release).

## Nota sobre artefactos publicados (no confundir el canónico)

- **Artefacto desplegable canónico = la imagen de GHCR** (`…-snapshot.{sha}` en develop, `x.y.z` en main).
  Se construye **una sola vez** en el job `ci`, se escanea (Trivy) y se **pasa por artifact** al job de push
  (load, no rebuild) — es byte a byte la que se probó (FR-P12/XVI §4).
- El **artifact `…-dist-*`** (retención 90 d) es la dist compilada suelta, para **auditoría / futuro CD
  (DO-7)**; NO es "lo desplegado". No lo consume ningún job hoy.

## Cómo aplicarlo (manual, hasta que haya IaC)

`Settings → Branches → Add branch ruleset` para `main` y `develop`, marcando lo anterior, y el tag ruleset
`v*`. Verificación (AC-3): abrir un PR con un test roto o un secreto de prueba → el merge debe quedar
**bloqueado**; empujar un tag `v*` sobre un commit fuera de `main` → el release debe **abortar** en el job
`ci` (`merge-base`).
