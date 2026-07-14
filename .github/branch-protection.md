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

### Status checks requeridos (config vigente · corregida por 012)

**Solo se marcan *required* los checks UNIVERSALES** (los que corren en **todo** PR, evento `pull_request`,
sin filtro `paths:`). Nombres exactos de los jobs:

| Check (job name) | Workflow | FR |
|---|---|---|
| `Guardián de Constitución + trazabilidad` | `pr-validation-back.yml` **y** `pr-validation-front.yml` | FR-P07, FR-P08 |
| `Guardián de Constitución (agente · opt-in)` | ambos PR-gates | FR-009 |
| `Code review registrado` | ambos PR-gates | FR-010 / FR-P22 |
| `gitleaks (todo el repo)` | `secrets-scan.yml` | FR-P04 |

> **Los checks POR COMPONENTE NO se marcan required** (`lint · typecheck · test (Postgres)`, `Contratos
> (Spectral + oasdiff)`, `Imagen backend + Trivy` de back; `lint · typecheck · test · build`, `Imagen
> frontend + Trivy` de front). Corren y aparecen en su PR (rojo si fallan), pero **no** están en la lista
> *required* de la rama. Motivo abajo.

> **⚠ Lección (feature 012 · fallo real):** con branch protection **clásica** (la de este repo), un required
> check cuyo workflow **no se dispara** por `paths:` queda en **"Expected — Waiting for status to be reported"
> → BLOQUEA el merge para siempre** (NO es *skipped→neutral*; esa suposición previa era **falsa** para
> protección clásica). Por eso, requerir checks **por componente** cuelga los PRs del **otro** componente
> (un PR de front nunca satisface `Imagen backend + Trivy`, y viceversa). **Solo los universales pueden ser
> required** sin deadlock. Además, cuidado con **required checks huérfanos** añadidos a mano (p. ej.
> `Lint (pull_request)` no lo emite ningún *job* —los "Lint" son *steps*— y bloqueaba TODO PR); retirado.

> **Trade-off aceptado (deuda):** al no requerir los checks por componente, un PR *podría* mergearse con un
> check de componente en rojo. El **fix robusto** (pendiente, posible feature 013) es un **job "gate"
> agregador por componente** que corra siempre (filtro `paths:` movido a `if:` de job, con
> `dorny/paths-filter`), de modo que un job *skipped* reporte el required como pasado y el gate por
> componente vuelva a ser exigible sin deadlock.

> **Guardián-agente (opt-in):** `Guardián de Constitución (agente · opt-in)` pasa en verde (job *skipped*)
> sin el secret `ANTHROPIC_API_KEY`; marcarlo required es inocuo (siempre verde/neutral). Con la key, llama a
> la API (FR-009).

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
