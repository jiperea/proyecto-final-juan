# Feature Specification: Checks de gobernanza UNIVERSALES (required sin deadlock)

**Feature Branch**: `013-universal-governance-checks`

**Created**: 2026-07-14

**Status**: Draft

**Input**: Problema REAL detectado al mergear 012: con branch protection clásica, un *required check* cuyo
workflow no se dispara por `paths:` queda en **"Expected — Waiting for status to be reported"** y **bloquea
el merge para siempre**. Los checks de gobernanza (Guardián ×2, Code review) viven hoy DENTRO de los PR-gates
filtrados por componente → cuelgan los PRs que no tocan ese componente (front, docs, config).

> **Relación con 010/011/012:** endurecimiento de gobernanza del pipeline (010). No cambia la lógica de
> ningún gate; cambia **dónde se declaran** los jobs de gobernanza y **qué los dispara**. Cierra la deuda
> anotada en 012 (`branch-protection.md`).

## Clarifications

### Session 2026-07-14
- Q: ¿Por qué cuelgan los PRs? → A: `pr-validation-back.yml` (paths `backend/**`,`contracts/**`) y
  `pr-validation-front.yml` (paths `frontend/**`,`contracts/**`) contienen los jobs `Guardián de Constitución
  + trazabilidad`, `Guardián de Constitución (agente · opt-in)` y `Code review registrado`. Al marcarlos
  *required*, un PR que no toca ese componente no los dispara → GitHub los deja en "Expected" → merge
  bloqueado. (Un PR de solo-front colgó por los de back; uno solo-docs colgaría por todos.)
- Q: ¿Solución? → A: mover esos 3 jobs a un **workflow universal sin `paths:`** (como `secrets-scan.yml`,
  que ya corre en todo PR), de modo que reporten estado en CUALQUIER PR. Los checks **por componente**
  (lint/typecheck/test, contratos, imagen+Trivy) se quedan donde están (no required globalmente por ahora).
- Q: ¿`skipped→neutral` no resolvía esto? → A: NO con branch protection **clásica** (la del repo): un
  required que no corre queda "Expected" y bloquea; solo un check que SÍ se ejecuta (aunque su lógica sea
  trivial) reporta estado. Por eso hay que hacer que el workflow **se dispare siempre**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cualquier PR puede mergear si pasa la gobernanza, sin deadlock por `paths:` (Priority: P1)

Como mantenedor, quiero que los checks *required* de gobernanza (Guardián ×2, Code review) + gitleaks corran
en **todo** PR —toque lo que toque— para que un PR legítimo (de front, de docs, de config…) no quede
bloqueado eternamente en "Expected — Waiting for status to be reported".

**Why this priority**: hoy el merge de PRs que no tocan back/front está **roto** (deadlock real, visto en
012). Sin esto, la protección de rama es inusable para cambios transversales.

**Independent Test**: abrir un PR que **no** toque `backend/**` ni `frontend/**` (p. ej. solo `docs/**`) →
los 3 checks de gobernanza + gitleaks **se ejecutan y pasan**, y el PR queda **mergeable** (no "Expected").

**Acceptance Scenarios**:
1. **Given** un PR que solo toca `docs/**`, **When** se abre, **Then** `Guardián de Constitución +
   trazabilidad`, `Guardián de Constitución (agente · opt-in)`, `Code review registrado` y `gitleaks (todo el
   repo)` **reportan estado** (no quedan "Expected"), y el PR es mergeable si pasan.
2. **Given** un PR que toca `backend/**`, **When** se abre, **Then** corren **tanto** los checks de
   gobernanza (universales) **como** los de componente de back (lint/test, contratos, imagen+Trivy) —sin
   regresión ni duplicado bloqueante.
3. **Given** un PR que toca `frontend/**`, **When** se abre, **Then** ídem con los checks de componente de
   front.

### Edge Cases
- Si el guardián-agente sigue **opt-in** sin `ANTHROPIC_API_KEY`: su job pasa en verde (skipped/neutral) sin
  llamar a API → seguro como required (siempre reporta). API-free intacto.
- Si un mismo nombre de job de gobernanza queda declarado en dos sitios (universal + componente) → habría
  checks duplicados/ambiguos; la feature debe dejar **una sola** fuente de cada check de gobernanza.
- Un PR que toca back **y** front: gobernanza corre **una** vez (workflow universal), no dos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (workflow de gobernanza universal)**: THE pipeline SHALL ejecutar los jobs de gobernanza
  —`Guardián de Constitución + trazabilidad` (determinista), `Guardián de Constitución (agente · opt-in)` y
  `Code review registrado`— desde un workflow que se dispare en **todo** `pull_request` (y push a ramas
  protegidas) **sin filtro `paths:`**, de modo que reporten estado en cualquier PR. Análogo a `secrets-scan.yml`.
- **FR-002 (una sola fuente por check)**: THE feature SHALL eliminar esos 3 jobs de gobernanza de
  `pr-validation-back.yml` y `pr-validation-front.yml` (o dejarlos sin producir el check *required*), de modo
  que **no** haya definiciones duplicadas del mismo *check context* que confundan a branch protection.
- **FR-003 (lógica de los jobs preservada)**: THE cambio SHALL preservar la lógica exacta de cada job
  (mismos scripts `validate-constitution.sh`/`acceptance-check.sh`, mismo patrón del guardián-agente
  `claude -p` gated a `ANTHROPIC_API_KEY`, mismo code-review-gate) y sus **nombres de check** exactos (para
  que la lista de required siga siendo válida por nombre). Solo cambia dónde se declaran y qué los dispara.
- **FR-004 (checks por componente intactos)**: THE checks por componente (`lint · typecheck · test`,
  `Contratos (Spectral + oasdiff)`, `Imagen backend + Trivy`; `lint · typecheck · test · build`, `Imagen
  frontend + Trivy`) SHALL permanecer en sus PR-gates filtrados por `paths:` sin cambios (no required
  globalmente; su exigibilidad por componente = aggregator gate, fuera de alcance).
- **FR-005 (cadena de suministro y permisos)**: THE workflow universal SHALL usar **actions ancladas por SHA
  de 40 chars** (FR-P13/AC-6) y **permisos mínimos** (`contents: read`; `checks/pull-requests` solo si un job
  los necesita, como el code-review-gate); no publica artefactos. API-free intacto (NFR-P03): el
  guardián-agente sigue desactivado sin la key.
- **FR-006 (documentación de gobernanza)**: THE `docs/branch-protection.md` SHALL reflejar la lista de
  *required* corregida (los 3 de gobernanza universales + `gitleaks`), la **lección del deadlock**
  (required + `paths:` en protección clásica = "Expected" que bloquea; NO es skipped→neutral) y la retirada
  del check huérfano `Lint (pull_request)`. Incluye la constancia redactada en 012 (commit `05875bf`), que
  esta feature **supersede**. Nota en `docs/15-devops-bitacora.md`.

### Key Entities
- **Workflow universal de gobernanza**: nuevo `.yml` sin `paths:`, dispara en todo PR; contiene los 3 jobs de
  gobernanza (nombres de check preservados).
- **PR-gates por componente**: `pr-validation-back.yml`/`pr-validation-front.yml` — pierden los jobs de
  gobernanza, conservan los de componente.
- **Lista de required checks** (`branch-protection.md` + Settings): 3 gobernanza universales + gitleaks.

## Success Criteria *(mandatory)*

- **SC-001**: en Actions real, un PR que **solo** toca `docs/**` dispara y pone en **verde** los 3 checks de
  gobernanza + gitleaks, y queda **`MERGEABLE`** (ninguno en "Expected").
- **SC-002**: un PR que toca `backend/**` sigue ejecutando gobernanza **y** los checks de componente de back;
  un PR que toca `frontend/**`, ídem con front — **sin regresión** (los checks de componente siguen apareciendo).
- **SC-003**: **no** hay checks de gobernanza **duplicados** (cada nombre de check lo produce **un** job).
- **SC-004 (cadena de suministro)**: `grep` sin `uses: …@v[0-9]` en el workflow nuevo/tocados (AC-6); permisos
  declarados mínimos.
- **SC-005 (API-free)**: sin la key, el guardián-agente sigue skipped/verde; ninguna llamada a LLM de pago en
  CI (NFR-P03 intacto).

## Verificación (determinista, sin IA)
Feature de pipeline, sin componente IA. Se verifica por la **ejecución real en Actions** (un PR solo-docs
mergeable con gobernanza verde; PRs de back/front sin regresión) + validación estática (YAML válido, SHA-pin,
un solo job por check, permisos mínimos). Sin evals promptfoo.

## Assumptions
- Mover un job entre workflows preservando su `name:` mantiene el **check context** con el mismo nombre → la
  lista de required por nombre sigue válida. (A verificar en la ejecución real: que branch protection lo
  reconoce igual.)
- El code-review-gate actual es un certificador (dummy/registro, reto §4); se mueve tal cual.
- La verificación final es la ejecución real (el deadlock no es detectable sin remoto), coherente con 011/012.
- Panel de gate reducido a `revisor-devops` (dominio CI/CD), como en 011/012 — decisión documentada por
  alcance acotado. G2/G3 se consolidan; verificación final = ejecución real.
- Aggregator gate por componente (para volver a exigir los checks de componente sin deadlock) queda **fuera
  de alcance** (deuda futura); esta feature solo desacopla la gobernanza.
