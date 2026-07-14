# Feature Specification: Endurecimiento del pipeline tras 1ª ejecución real (M12)

**Feature Branch**: `chore/devops-do1-pipeline` (transversal, ADR-0004 — endurece 010)

**Created**: 2026-07-14

**Status**: Draft

**Input**: 3 fallos REALES descubiertos al ejecutar por fin los workflows en Actions (fork público
`jiperea/proyecto-final-juan`, tras el muro de billing de la org). No eran detectables sin ejecución remota.

> **Relación con 010:** endurecimiento de la feature `010-devops-pipeline`. Reutiliza sus FR-P y ACs;
> aquí se corrigen 3 defectos y se **enmienda FR-P05** (política de Trivy). Detalle en `docs/pipeline-spec.md`.

## Clarifications

### Session 2026-07-14
- Q: ¿Los tests de back necesitan datos semilla en CI? → A: **Sí** — los helpers crean órdenes cuyo
  `assigned_to` referencia usuarios semilla; sin seed hay violación de FK. Se ejecuta `npm run seed` tras
  migrar y antes de los tests.
- Q: ¿Cómo se corre Spectral de forma fiable? → A: vía la **Docker action `stoplightio/spectral-action`
  fijada por SHA** (trae un Spectral funcional; el `npx spectral-cli@6.14.2` crashea por un bug ESM de una
  dep transitiva, no por el contrato).
- Q: ¿Qué bloquea Trivy tras ver las vulnerabilidades reales? → A: **CRITICAL/HIGH corregibles de las deps
  de la app**; se **excluye el npm empaquetado del base image** (`/usr/local/lib/node_modules/npm`), que es
  tooling del contenedor y NO la superficie de ejecución (runtime = `node dist/main.js`). Residuo documentado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El PR-gate pasa en verde en una ejecución real, sin perder rigor (Priority: P1)

Como equipo, queremos que al ejecutar los workflows en Actions **de verdad** (no solo en local), los gates
que deben pasar pasen — y que los que fallen sea por defectos reales, no por defectos del propio pipeline
(entorno de test sin sembrar, herramienta que crashea, o ruido de vulnerabilidades ajenas a la app).

**Why this priority**: sin esto, el pipeline "existe" pero no demuestra nada verde; el reto exige que
`install`+`test` pasen en una máquina limpia.

**Independent Test**: abrir la PR de smoke / push a `develop` en el repo con Actions activo → los 3 jobs
antes rojos (`lint·typecheck·test`, `Contratos`, `Imagen backend + Trivy`) pasan a **verde**, y el resto de
gates siguen funcionando (guardián, gitleaks, code-review).

**Acceptance Scenarios**:
1. **Given** el job de tests de back con Postgres de servicio, **When** corre en CI, **Then** la BD se
   **migra y se siembra** antes de los tests y las suites de integración/contrato pasan (sin `FK violated`).
2. **Given** el job de contratos, **When** corre Spectral, **Then** la herramienta **arranca y lint-a** los
   contratos sin `ReferenceError`/crash, fallando solo ante violaciones reales de severidad `error`.
3. **Given** el job de imagen, **When** corre Trivy, **Then** **falla** ante `CRITICAL/HIGH` corregibles de
   las **dependencias de la app**, y **no** falla por las deps internas del **npm del base image**.

### Edge Cases
- Si el seed falla (BD no migrada) → el job de tests falla claro en el paso `Seed`, antes de los tests.
- Si Spectral encuentra un error real en el contrato → el job sigue fallando (no se enmascara).
- Si aparece un `CRITICAL/HIGH` corregible en una dep **real de la app** → Trivy **sí** bloquea (el skip solo
  cubre el path del npm del base image, no el `node_modules` de la app).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (seed del entorno de test en CI · conformidad FR-P02)**: WHEN un job de CI de backend ejecuta la
  batería de tests (Vitest con Postgres de servicio) THE pipeline SHALL, tras `prisma migrate deploy` y
  **antes** de los tests, ejecutar `npm run seed` (crea usuarios semilla + órdenes) para que los tests de
  integración/contrato — que referencian `assigned_to` de usuarios semilla — no violen la FK
  `orders_assigned_to_fkey`. Aplica a `pr-validation-back`, `ci-develop-back`, `ci-main-back`.
- **FR-002 (Spectral fiable · conformidad FR-P03)**: WHEN el gate de contratos lint-a el OpenAPI THE pipeline
  SHALL ejecutar Spectral mediante un mecanismo que **arranque sin error de tooling** (la Docker action
  oficial `stoplightio/spectral-action` **fijada por SHA de 40 chars**, coherente con FR-P13), usando el
  ruleset `.spectral.yaml`, y SHALL fallar solo ante violaciones de severidad `error`. El job `contracts`
  declara la **elevación mínima de permisos** que la action necesite (`checks: write` si publica
  anotaciones; documentado, FR-P14). El `npx @stoplight/spectral-cli@6.14.2` queda descartado por bug ESM.
  *(Umbral fail=error y permisos exactos = verificados en la ejecución real en Actions — D-002/D-005.)*
- **FR-003a (runtime sin npm/npx · prerrequisito de FR-003b — resuelve BLOQUEANTE D-001)**: THE imagen de
  backend SHALL **NO invocar `npm`/`npx` en runtime**. El `CMD` pasa de `npx prisma migrate deploy && node
  dist/main.js` a **`node node_modules/prisma/build/index.js migrate deploy && node dist/main.js`** (prisma
  vía `node` directo). Solo así es cierto que el npm del base image no es superficie de ejecución.
- **FR-003b (política de Trivy · ENMIENDA FR-P05)**: WHEN el gate de imagen de **backend** escanea con Trivy
  THE pipeline SHALL fallar ante `CRITICAL/HIGH` **corregibles** de las **dependencias de la app**
  (`/app/node_modules`), y SHALL **excluir** las deps internas del **npm empaquetado del base image**
  (`usr/local/lib/node_modules/npm`) — legítimo **solo tras FR-003a** (ya no se invoca npm/npx en runtime).
  El residuo (vulns del npm del base image) se **documenta como aceptado** con motivo y **fecha de revisión**
  (al cambiar/parchear el base image); siguen **visibles** en el reporte. **No aplica al front** (nginx, sin
  npm — D-004). *(Verificación del formato exacto de `skip-dirs` = ejecución real en Actions.)*

### Key Entities
- **Entorno de test de CI**: BD Postgres de servicio + esquema (migraciones) + **datos semilla** (nuevo).
- **Gate de contratos**: Spectral (lint) + oasdiff (breaking) — cambia el *runner* de Spectral.
- **Política de Trivy**: qué rutas/deps hacen fallar el gate (se acota).

## Success Criteria *(mandatory)*

- **SC-001**: en una ejecución real de Actions, el job **`lint · typecheck · test (Postgres)`** de back pasa
  a **verde** (0 tests en rojo por FK/seed); el paso `Seed` aparece en el log entre `Migraciones` y `Tests`.
- **SC-002**: el job **`Contratos (Spectral + oasdiff)`** pasa a **verde** (Spectral arranca y no reporta
  `error`), verificable sin `ReferenceError` en el log.
- **SC-003**: el job **`Imagen backend + Trivy`** pasa a **verde** (0 `CRITICAL/HIGH` corregibles en deps de
  la app), y el reporte de Trivy sigue **listando** (sin bloquear) las del npm del base image.
- **SC-004**: el resto de gates (guardián, gitleaks, code-review, oasdiff) **siguen funcionando** igual
  (sin regresión); `grep` sigue sin hallar `uses: …@v[0-9]` (AC-6) — la nueva action va por SHA.
- **SC-005 (API-free intacto)**: ningún cambio introduce llamadas a LLM de pago en CI (NFR-P03 intacto).

## Verificación (determinista, sin IA)
Feature de pipeline, sin componente IA. Se verifica por la **ejecución real en Actions** (los 3 jobs verdes)
+ validación estática (YAML válido, SHA-pin, guardián/acceptance en 0). Sin evals promptfoo.

## Assumptions
- El seed (`prisma/seed.ts`) crea los usuarios/órdenes que los tests esperan (verificado: `SEED_USERS`
  technician1/2/3, dispatcher, supervisor). Ejecutarlo una vez por job mirror-ea el entorno local (que sí
  estaba sembrado) donde los tests iban verdes.
- El skip de Trivy se limita al **path del npm del base image**; las deps de la app (`/app/node_modules`)
  siguen evaluándose → si hubiera un CRITICAL/HIGH corregible **real de la app**, el gate bloquea.
- **Desviación consciente (ENMIENDA FR-P05):** aceptar las vulns del npm del base image es una decisión de
  política documentada; el endurecimiento pleno sería cambiar de base image / actualizar npm (fuera de
  alcance de hoy, se anota como deuda).
- No se re-corre el ciclo SDD completo de 010; esta feature es un endurecimiento acotado con su propio
  spec→…→G3 (panel reducido por el tamaño del cambio).
