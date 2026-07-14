# Feature Specification: PR Gate agregador (required sin deadlock, calidad preservada)

**Feature Branch**: `013-universal-governance-checks`

**Created**: 2026-07-14

**Status**: Draft (re-escalada tras G1: de "gobernanza universal" a "PR Gate agregador")

**Input**: Problema REAL al mergear 012: con branch protection clásica, un *required check* cuyo workflow no
se dispara por `paths:` queda en **"Expected — Waiting for status to be reported"** y **bloquea el merge para
siempre**. Un PR de solo-front colgó por los required de back; uno solo-docs colgaría por todos. G1 mostró
que "mover solo la gobernanza a universal y quitar los checks de componente de required" **o pierde el gate
de calidad** (un PR de back podría mergear con Trivy CRITICAL/HIGH; viola FR-P09/XIII) **o deja el deadlock**.

> **Fix raíz (patrón agregador):** un **único check *required* — `PR Gate` — que corre SIEMPRE** (sin
> `paths:`), detecta qué componente cambió, ejecuta gobernanza (siempre) + los jobs del componente tocado
> (los del resto se **skip**), y un **job final agrega** el resultado: pasa solo si todo lo relevante pasó
> (skip cuenta como OK). Siempre reporta estado → **sin deadlock**; agrega los jobs de componente → **calidad
> preservada**. Endurecimiento de gobernanza de 010; no cambia la **lógica** de ningún job, solo su
> orquestación. Supersede la constancia de 012 (`05875bf`).

## Clarifications

### Session 2026-07-14
- Q: ¿Por qué cuelgan los PRs? → A: los checks *required* (gobernanza y componente) viven en workflows con
  `paths:`; un PR que no toca ese componente no los dispara → GitHub los deja en "Expected" → merge bloqueado.
  (Confirmado en 012: PR solo-front colgó por los required de back.)
- Q: ¿Por qué no basta con "gobernanza universal + componente no-required"? → A: dejaría de bloquear por
  calidad/seguridad (lint/test/Trivy/Spectral); un PR de back mergearía con vulnerabilidades corregibles
  (viola FR-P09/XIII). Se necesita **agregar**, no **quitar**, los checks de componente.
- Q: ¿`skipped→neutral` no resolvía esto? → A: NO con protección clásica: un required que **no se ejecuta**
  queda "Expected" y bloquea. La solución es un check que **siempre se ejecuta** (el job agregador) y cuya
  conclusión depende de los `needs` (donde un job realmente *skipped* por `if:` cuenta como OK).
- Q: ¿El guardián-agente opt-in cuenta como *skipped* o *success*? → A: hoy el **job corre** y un *step*
  interno se salta sin la key → reporta **success** (no "skipped"). Con el agregador es indiferente: success
  y skipped ambos son OK para el gate. Se corrige la redacción para no repetir la confusión de 012.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cualquier PR mergea si pasa lo relevante; nada queda "Expected" (Priority: P1)

Como mantenedor, quiero **un solo check required (`PR Gate`)** que corra en todo PR y refleje el veredicto
agregado (gobernanza + los checks del componente tocado), para que ningún PR quede bloqueado eternamente en
"Expected" y, a la vez, no se pueda mergear con un check de calidad/seguridad en rojo.

**Why this priority**: hoy el merge está roto para PRs transversales (deadlock real, 012) y el "arreglo
ingenuo" sacrifica el gate de calidad. El agregador cierra ambos.

**Independent Test**: (a) un PR solo-`docs/**` → `PR Gate` corre, pasa y el PR es **mergeable**; (b) un PR de
back con un test roto o Trivy CRITICAL/HIGH → `PR Gate` **falla** y bloquea el merge.

**Acceptance Scenarios**:
1. **Given** un PR que solo toca `docs/**`, **When** se abre, **Then** `PR Gate` y `gitleaks` **reportan
   estado** (no "Expected"): gobernanza corre y pasa, los jobs de componente **skip**, el agregador pasa → PR
   **mergeable**.
2. **Given** un PR que toca `backend/**` con un fallo real (test rojo o Trivy CRITICAL/HIGH corregible),
   **When** corre, **Then** el job de componente de back **falla**, el agregador **falla** y el merge queda
   **bloqueado** (calidad preservada, FR-P09/XIII).
3. **Given** un PR que toca `frontend/**`, **When** corre, **Then** corren gobernanza + los jobs de front
   (los de back **skip**), y `PR Gate` agrega su resultado.
4. **Given** un PR que toca back **y** front, **When** corre, **Then** gobernanza corre **una sola vez** y
   ambos conjuntos de componente corren; el agregador exige que todos pasen.

### Edge Cases
- **Guardián-agente sin `ANTHROPIC_API_KEY`:** el job corre y reporta **success** (step interno saltado, sin
  llamar a API) → API-free intacto; el agregador lo cuenta como OK.
- **Job skipped por `if:` de componente:** el agregador trata `skipped` **y** `success` como OK; solo
  `failure`/`cancelled` hacen fallar el gate.
- **Bootstrap del propio PR de 013:** al añadir `PR Gate` y quitar los jobs viejos, la lista de required en
  Settings debe migrarse en un **orden** que no autobloquee la rama (ver FR-007).
- **Pushes rápidos:** el workflow declara `concurrency` por `ref` (`cancel-in-progress`) para no dejar un
  veredicto obsoleto.
- **Cancelación manual del último run (cancel-manual, r2):** si alguien cancela a mano el run de `PR Gate` sobre el commit
  más reciente (sin push que lo sustituya), el check queda sin conclusión (variante de "Expected"); se
  resuelve con un **re-run manual** — comportamiento inherente de GitHub, documentado (no requiere cambio de
  diseño).
- **Contratos (`contracts/**`):** cambios en el contrato disparan los jobs de **ambos** componentes que lo
  consumen (back y front), como hoy.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (workflow `PR Gate` universal, sin `paths:`)**: THE pipeline SHALL tener un workflow que se
  dispare en **todo** `pull_request` a `develop`/`main` **sin filtro `paths:`**, de modo que siempre produzca
  su check. (Sin trigger `push`: los required solo bloquean merges de PR y la rama ya prohíbe push directo →
  correr gobernanza en cada push post-merge no aporta bloqueo y gasta minutos — H-007.)
- **FR-002 (detección de cambios interna, fail-safe)**: THE workflow SHALL detectar qué rutas cambian
  (`backend/**`, `frontend/**`, `contracts/**`) con una action **anclada por SHA** (p. ej. `dorny/paths-filter`)
  y exponer banderas por componente, preservando el **espíritu de FR-P01** (no correr trabajo de un
  componente que no se toca) moviéndolo del trigger a un `if:` de job. **Fail-safe (resuelve H-003):** los
  globs SHALL cubrir la raíz de cada componente (`backend/**`, `frontend/**`, `contracts/**`); y si el job de
  detección **falla o no puede determinar** los cambios, THE workflow SHALL tratar **todos** los componentes
  como tocados (correr todo), nunca skipear por defecto → un filtro roto no puede convertirse en bypass
  silencioso de calidad. El job `changes` está en el `needs` del agregador (FR-004), así que su fallo también
  bloquea. Además, un PR que toque `.github/workflows/**` (incluido el propio `pr-gate.yml`) SHALL activar el
  fail-safe **correr todo** → un cambio a la lógica del gate se valida contra ambos componentes, no solo
  gobernanza (resuelve H-008a).
- **FR-003 (jobs orquestados, lógica intacta)**: THE workflow SHALL contener: (a) **gobernanza** —`Guardián
  de Constitución + trazabilidad`, `Guardián de Constitución (agente · opt-in)`, `Code review registrado`—
  **siempre** (sin `if:` de componente); (b) **componente back** —`lint · typecheck · test (Postgres)`,
  `Contratos (Spectral + oasdiff)`, `Imagen backend + Trivy`— con `if:` back∨contracts; (c) **componente
  front** —`lint · typecheck · test · build`, `Imagen frontend + Trivy`— con `if:` front∨contracts. La
  **lógica de cada job se preserva** (mismos scripts `validate-constitution.sh`/`acceptance-check.sh`, mismo
  guardián-agente `claude -p` gated a la key, mismos lint/test/Spectral/oasdiff/Trivy y su config actual).
- **FR-004 (job agregador `PR Gate` — el único required)**: THE workflow SHALL tener un job final **`PR
  Gate`** con `if: always()` cuyo `needs:` **enumera EXPLÍCITAMENTE TODOS** los demás jobs del workflow —el
  de detección `changes`, los 3 de gobernanza y los 5 de componente— (resuelve H-002). El job **falla** si
  algún `needs.*.result` es `failure` o `cancelled`, y **pasa** si todos son `success` o `skipped`. Se
  implementa recorriendo `needs.*.result` (no una lista escrita a mano de resultados), de modo que **omitir
  un job del `needs` sea visible**. Este job **siempre se ejecuta** (nunca "Expected") y es el único que se
  marca *required*. **Verificación estática (SC-006):** un check confirma que el `needs` de `PR Gate` incluye
  a **todos** los `jobs:` del fichero (ningún job fuera del agregador → sin bypass silencioso). Un job nuevo
  que se añada al workflow SHALL añadirse también al `needs`.
- **FR-005 (lista de required mínima)**: THE branch protection de `develop` y `main` SHALL requerir **solo**
  `PR Gate` **y** `gitleaks (todo el repo)` (ambos corren en todo PR). SHALL **retirar** de required los
  nombres antiguos por componente y de gobernanza (ahora subsumidos por `PR Gate`) y el huérfano
  `Lint (pull_request)`.
- **FR-006 (cadena de suministro y permisos mínimos)**: THE workflow SHALL usar **actions ancladas por SHA de
  40 chars** (FR-P13/AC-6) y **permisos mínimos** a nivel de workflow (`contents: read`), elevando por-job
  solo lo estrictamente necesario (el job de test usa Postgres de servicio, sin permisos de repo extra; el
  **code-review-gate NO necesita `checks`/`pull-requests`** —solo escribe en `$GITHUB_STEP_SUMMARY`—, se deja
  con `contents: read`, D-004/H-006). El job `contracts` mantiene `checks: write` (spectral-action, como hoy).
  **PRs de fork (H-005):** el modelo de este repo son **ramas del propio fork** (mismo repo, no forks
  externos) → el `GITHUB_TOKEN` tiene los permisos declarados; se documenta que un PR de **fork externo** no
  recibiría `checks: write` y `contracts` podría degradar (limitación aceptada, fuera del flujo actual). No
  publica artefactos. API-free intacto (NFR-P03). `concurrency` por `github.ref` con `cancel-in-progress`.
- **FR-007 (migración "Settings primero", sin ventana de deadlock + rollback · resuelve D-003/D-007/D-010/H-001/H-004)**:
  THE despliegue SHALL ordenar los pasos para que **en ningún instante** un required check dependa de `paths:`
  (que es lo que causa el deadlock), retirándolos de *required* **antes** de tocar los workflows:
  - **Paso 1 (Settings, sin PR):** en `develop` y `main`, **reducir la lista de required a `{gitleaks (todo
    el repo)}`** (el único que corre en todo PR hoy), **retirando** los checks `paths:`-dependientes (los 3 de
    gobernanza + los 5 de componente) y el huérfano `Lint (pull_request)`. Desde este instante **ningún PR se
    cuelga** (no queda required con `paths:`). Gating temporalmente reducido a secretos —ventana breve y
    coordinada por el mantenedor, sin merges de código de riesgo—.
  - **Paso 2 (PR):** mergear el PR que **añade `pr-gate.yml`** y **absorbe/borra** los jobs de
    `pr-validation-*.yml`. Ese PR solo necesita `gitleaks` (+ opcionalmente `PR Gate`, que ya reporta) para
    pasar → **no se autobloquea**. `PR Gate` empieza a reportar en `develop`.
  - **Paso 3 (Settings):** fijar required = **`{PR Gate, gitleaks}`**. Gating pleno restaurado, deadlock-free
    (ambos corren en todo PR).
  - **Rollback:** si `PR Gate` no se reconoce por su nombre, volver a `{gitleaks}` en Settings (repo propio)
    y/o revertir el commit; el repo nunca queda con required huérfanos. Secuencia documentada en
    `docs/branch-protection.md` (tipo manual §E).
- **FR-008 (documentación de gobernanza fiel · resuelve D-002/H-004/FR-006-doc)**: THE feature SHALL
  actualizar `docs/pipeline-spec.md` para reflejar el `PR Gate` agregador: **reformular FR-P01** ("los checks
  de **componente** se acotan por ruta —ahora vía `if:` dentro del gate— y los de **gobernanza** son
  transversales") y **FR-P07/P08/P22** ("WHEN corre el **PR Gate**…" en vez de "el PR-gate por componente");
  **FR-P21** (el guardián-agente **corre y reporta `success`** sin la key —step interno saltado—, **no**
  "skipped"; resuelve D-006/D-009/H-005) y **NFR-P01** (ahora **un** workflow `pr-gate.yml` con jobs en
  paralelo <10 min, no "workflow back o front"); y `docs/branch-protection.md` (lista `{PR Gate, gitleaks}` +
  lección del deadlock: required+`paths:` en clásica = queda "Expected" y bloquea, **NO** skipped→neutral;
  retirada del huérfano `Lint (pull_request)` + secuencia de migración de FR-007). Nota en
  `docs/15-devops-bitacora.md` (incluye la constancia de 012 `05875bf`, superseída). **Cumplimiento
  verificado en G3/revisión**, ya que el guardián determinista solo comprueba fecha de creación, no contenido
  (H-006).

### Key Entities
- **`pr-gate.yml`**: workflow único sin `paths:`; jobs de detección + gobernanza + componente + agregador.
- **Job `PR Gate`**: agregador `needs`+`if: always()`; **único required** (con gitleaks).
- **`pr-validation-back.yml`/`pr-validation-front.yml`**: se **retiran/absorben** en `pr-gate.yml` (una sola
  fuente por check; sin duplicados — evita ambigüedad de contexto).
- **Lista de required** (Settings + `branch-protection.md`): `{PR Gate, gitleaks (todo el repo)}`.

## Success Criteria *(mandatory)*

- **SC-001 (no deadlock)**: en Actions real, un PR que **solo** toca `docs/**` deja `PR Gate` + `gitleaks` en
  **verde** y el PR **`MERGEABLE`** (ninguno "Expected").
- **SC-002 (calidad preservada)**: un PR de `backend/**` con un fallo inyectado (test roto o Trivy
  CRITICAL/HIGH corregible) → `PR Gate` **falla** y el merge queda **bloqueado**. Ídem front.
- **SC-003 (sin regresión de cobertura)**: en un PR de back, corren gobernanza + los 3 jobs de back; en uno
  de front, gobernanza + los 2 de front; los del otro componente aparecen **skipped** (no ausentes).
- **SC-004 (un solo required efectivo + gobernanza única)**: la lista de required es `{PR Gate, gitleaks}`;
  la gobernanza corre **una** vez por PR (no duplicada). Sin checks huérfanos.
- **SC-005 (cadena de suministro / API-free)**: `grep` sin `uses: …@v[0-9]` en `pr-gate.yml` (AC-6); permisos
  mínimos declarados; guardián-agente verde sin la key, cero LLM de pago en CI (NFR-P03).
- **SC-006 (agregador sin bypass, auto-verificado en CI)**: un **job automático** de `pr-gate.yml` (no una
  comprobación manual puntual) SHALL verificar en **cada** PR que el `needs:` de `PR Gate` incluye **todos**
  los `jobs:` del fichero (incl. `changes`) y que el gate recorre `needs.*.result` — y **fallar** si algún
  job queda fuera del agregador. Así un job futuro añadido sin registrarlo en `needs` se caza en CI, no en
  revisión manual (resuelve H-008b). Este self-check está a su vez en el `needs` del agregador.

## Verificación (determinista, sin IA)
Feature de pipeline, sin IA. Se verifica por la **ejecución real en Actions** (PR solo-docs mergeable; PR de
back/front con fallo inyectado que bloquea; jobs del otro componente en skipped) + validación estática (YAML
válido, un solo job por check, SHA-pin, permisos, `concurrency`, agregador con `if: always()`). Sin promptfoo.

## Assumptions
- **Contexto de check preservado por nombre:** marcar `PR Gate` como required por su nombre de job funciona;
  el rollback de FR-007 cubre el caso de que no se reconozca. (A verificar en la ejecución real; el nombre
  `PR Gate` es **nuevo**, así que no depende de preservar nombres viejos.)
- **`if: always()` + `needs.*.result`:** un job `skipped` reporta `result=skipped` (OK para el gate); solo
  `failure`/`cancelled` bloquean. (Comportamiento estándar de GitHub Actions.)
- **Consolidación de los PR-gates** en `pr-gate.yml` es coherente con el Principio XVI reformulado (FR-008):
  el filtrado por componente se preserva vía `if:` (mismo efecto que `paths:` a nivel de job), no se pierde.
- **Aggregator = alcance de 013** (era la "deuda futura" que 011/012 anotaron; ahora se materializa). No se
  añaden gates nuevos de calidad; se re-orquestan los existentes.
- Panel de gate reducido a `revisor-devops` (+ `revisor-cinico`), como en 011/012 — alcance acotado a
  pipeline. G2/G3 consolidados; verificación final = ejecución real.
- **Riesgo operativo aceptado de la migración (H-010/H-011):** el cambio de la lista de *required* es una
  operación **manual** en GitHub Settings; durante la ventana del Paso 1→3 de FR-007 el gating baja a solo
  `gitleaks`, y el orden de pasos no tiene barrera técnica (si se hace el PR antes del Paso 1, reaparece el
  deadlock —lo cubre el rollback—). **Control compensatorio:** repo **solo-mantenedor**, ventana **breve y
  coordinada** (no se fusionan otros PRs ni código de riesgo durante la migración), y se sigue el orden
  documentado en `docs/branch-protection.md` (§ migración, tipo manual §E). No hay forma de hacer un cambio de
  Settings "atómico/guardado" en GitHub → riesgo intrínseco, aceptado y documentado (no un defecto de diseño).
