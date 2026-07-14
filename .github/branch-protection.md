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

### Status checks requeridos (config vigente · feature 013 · PR Gate agregador)

**Required = SOLO 2 checks, ambos corren en TODO PR** (deadlock-free):

| Check (job name) | Workflow | Qué agrega/cubre |
|---|---|---|
| `PR Gate` | `pr-gate.yml` | **agregador**: gobernanza (guardián ×2, code-review) + los jobs del componente tocado (lint/test, contratos, imagen+Trivy de back; lint/test/build, imagen+Trivy de front). Falla si alguno falla; skip = OK |
| `gitleaks (todo el repo)` | `secrets-scan.yml` | secretos (FR-P04), universal |

> **Los checks por componente NO se marcan required por nombre** (los subsume `PR Gate` vía su `needs`).
> Marcarlos directamente reintroduce el deadlock (ver lección).

#### ⚠ Lección del deadlock (feature 012→013)

Con **branch protection clásica** (la de este repo), un required check cuyo workflow **no se dispara** por
`paths:` queda en **"Expected — Waiting for status to be reported"** y **BLOQUEA el merge para siempre**.
**NO** es *skipped→neutral* (esa nota previa era **falsa** y causó el incidente de 012: un PR de solo-front
colgó por los required de back). Por eso los únicos required son checks que corren en **todo** PR: `PR Gate`
(siempre, sin `paths:`) y `gitleaks`. También se retiró el check **huérfano** `Lint (pull_request)` (ningún
*job* lo emite — los "Lint" son *steps*).

#### Migración "Settings primero" (para aplicar a mano, sin ventana de deadlock)

1. **Settings → required = `{gitleaks (todo el repo)}`** (retirar los 8 checks `paths:`-dependientes + el
   huérfano `Lint (pull_request)`). Desde aquí **ningún PR se cuelga**. Gating temporalmente reducido a
   secretos → ventana **breve y coordinada** (no fusionar código de riesgo mientras dure).
2. **Mergear** el PR de 013 (añade `pr-gate.yml`, borra `pr-validation-*.yml`). `PR Gate` empieza a reportar.
3. **Settings → required = `{PR Gate, gitleaks}`**. Gating pleno restaurado, deadlock-free.

> **Orden crítico:** Paso 1 **antes** de mergear (Paso 2), o el PR se autobloquea por los required viejos.
> **Primero `develop`, luego `main` (D-003):** aplica y valida la migración en `develop` (con `PR Gate` en
> verde) **antes** de tocar `main`, y **no fusiones a `main`** durante la ventana (es la rama de release
> `v*`/CD-prod; la defensa `merge-base` de `ci-main-*` sigue exigiendo que el tag venga de un PR, pero no
> re-corre los checks de calidad).
> **Rollback:** si `PR Gate` no se reconoce, volver a `{gitleaks}` en Settings y/o revertir el commit.
> **Riesgo operativo (aceptado):** la ventana 1→3 reduce el gating a secretos; es intrínseco a un cambio
> manual de Settings (GitHub no lo hace atómico) — repo solo-mantenedor, ventana breve y coordinada.

> **Guardián-agente (opt-in):** `Guardián de Constitución (agente · opt-in)` **corre y reporta success** sin
> `ANTHROPIC_API_KEY` (step interno saltado); queda subsumido en `PR Gate` (no se marca required por separado).

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
