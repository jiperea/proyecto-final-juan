# Feature Specification: Resumen IA dev-only + indisponibilidad honesta en el entorno desplegado

**Feature Branch**: `018-ai-summary-dev-only`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "El resumen por IA no va bien en el producto desplegado. Decisión: IA dev-only, honesto en prod — sin API de pago. Formalizar el alcance y el mensaje de UI; el entorno desplegado debe indicar 'no disponible en este entorno' en vez de un 503 con reintento, e idealmente ocultar/deshabilitar el botón."

---

## Contexto y motivación *(no normativo)*

Diagnóstico verificado en vivo sobre el stack contenedorizado (2026-07-15): el endpoint de resumen IA
(`POST /v1/orders/{orderId}/ai-summary`, Brief Func #5) está **completo y correcto** (gate de material
notas≥30 + evidencia≥1, rate-limit, fallback "no inventa", 503 limpio ante fallo del proveedor; tests con
proveedor *mock*). Pero el proveedor real `AI_PROVIDER=claude-cli` invoca el binario **`claude`** por
`execFile`, y **la imagen del backend no lo incluye** → con material suficiente devuelve
**503 `SERVICE_UNAVAILABLE`**, que la UI mapea a **«No disponible. Reinténtalo.»** (engañoso: reintentar
nunca va a funcionar en ese entorno). El host de desarrollo sí tiene `claude` → en *modo dev* funciona.

**Decisión (usuario, 2026-07-15): IA dev-only, honesto en producción.** No se añade API de pago (regla dura
de la constitución "sin API de pago"). Esta feature **formaliza** que Func #5 es operable solo en dev y hace
que el entorno desplegado (contenedor/Render, sin `claude`) lo comunique **con honestidad** (no como un
error transitorio con reintento), idealmente ocultando/deshabilitando el disparador. Cierra la deuda
**BL-072** como decisión dev-only (no como "proveedor de producción por API").

**No amplía** el alcance funcional del brief: no añade proveedores de pago, ni endpoints de negocio, ni
cambia la lógica de resumen/no-inventar/PII. Es **presentación honesta de una capacidad no disponible** +
una señal de disponibilidad.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Indisponibilidad honesta en el entorno desplegado (Priority: P1)

Un supervisor usa el producto **desplegado** (contenedor, sin proveedor IA). Al pulsar «Resumir con IA»
sobre una orden con material suficiente, ve un mensaje claro: **«El resumen por IA no está disponible en
este entorno»**, **sin** invitación a reintentar, y el botón queda **deshabilitado** para esa sesión de la
vista (no re-invita a un intento que fallará). Nada se cuelga y el resto de la revisión (aprobar/rechazar)
funciona con normalidad.

> **Alcance MVP — reactivo (resuelve H-002):** el MVP es **reactivo** (el botón se muestra; al primer intento
> con proveedor no operable, la UI comunica la indisponibilidad y deshabilita el reintento). La ocultación
> **proactiva** del botón *antes* de pulsarlo (vía un endpoint/flag de capacidad a priori) es **stretch
> explícito**, fuera del MVP.

**Why this priority**: Es el núcleo del encargo: hoy el producto desplegado miente ("Reinténtalo") sobre
una capacidad que nunca responderá en ese entorno.

**Independent Test**: Con el proveedor clasificado como no operable, el backend responde **501** con
`code: AI_UNAVAILABLE` (no `503 SERVICE_UNAVAILABLE` transitorio); la UI muestra el mensaje de entorno y
deshabilita el reintento; aprobar/rechazar siguen operativos.

**Acceptance Scenarios**:

1. **Given** un entorno con proveedor **no operable** (adaptador clasifica ENOENT del binario, o guard
   dev-only en prod), **When** un supervisor pide el resumen de una orden en `pending_review` con material
   suficiente, **Then** el backend responde **HTTP 501** con `code: AI_UNAVAILABLE` y mensaje **genérico**
   (sin nombre de binario/ruta/versión/traza).
2. **Given** ese código, **When** la UI lo recibe, **Then** muestra «El resumen por IA no está disponible en
   este entorno», **deshabilita** el botón y **no** ofrece reintento.
3. **Given** ese mismo entorno, **When** el supervisor aprueba/rechaza, **Then** funcionan con normalidad
   (la indisponibilidad de IA no bloquea la revisión).
4. **Given** ese entorno, **When** quien pide el resumen **no** es supervisor o la orden **no** está en
   `pending_review`, **Then** recibe **401/403/404** (RBAC/estado) y **nunca** `AI_UNAVAILABLE` (la autz va
   antes que la detección de disponibilidad).

---

### User Story 2 - La IA sigue operable en dev (sin regresión) (Priority: P1)

En **desarrollo** (host con `claude` disponible, o proveedor *mock* en tests), el resumen IA funciona
exactamente como hasta ahora: material suficiente → resumen; insuficiente → "no inventa"; rate-limit y
errores transitorios (429/503) sin cambios.

**Why this priority**: La decisión "dev-only" no debe romper la operatividad en dev ni la suite existente.

**Independent Test**: Con proveedor operable (mock/claude), los tests existentes de resumen IA
(`fe4-summary-panel`, evals) siguen en verde; el nuevo código de indisponibilidad **no** se dispara.

**Acceptance Scenarios**:

1. **Given** proveedor operable, **When** hay material suficiente, **Then** se devuelve el resumen (sin el
   código de indisponibilidad).
2. **Given** proveedor operable, **When** el material es insuficiente, **Then** se mantiene el fallback
   "no inventa" (`sufficient:false`).

---

### Edge Cases

- **Fallo transitorio real del proveedor** (timeout, exit≠0 con el binario **presente**): sigue siendo
  `SERVICE_UNAVAILABLE` **con** reintento (distinto de "no disponible en este entorno").
- **`AI_PROVIDER=mock`** (tests): operable; nunca dispara `AI_UNAVAILABLE`.
- **Material insuficiente en entorno no operable**: **prevalece el gate de material** → `sufficient:false`
  (200). Porque el gate de material se evalúa en el dominio **antes** de invocar al proveedor, y la
  indisponibilidad se clasifica **desde** la invocación (FR-002/FR-007).
- **`claude` presente pero sin sesión/credenciales válidas** (dev mal configurado): se clasifica como
  **transitorio** (`SERVICE_UNAVAILABLE`), no `AI_UNAVAILABLE`. Esta feature ataca el caso desplegado
  sin-binario; el dev mal configurado se resuelve reautenticando (fuera de alcance).
- **Concurrencia**: al ser clasificación por-invocación (sin caché ni probe separado), no hay estado
  compartido que sincronizar; cada petición clasifica su propio resultado (FR-002).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN el adaptador del proveedor IA no puede ejecutar el binario porque **no existe**
  (`execFile` falla con `ENOENT`) **o** cuando aplica el guard dev-only (FR-006) THE backend SHALL propagar
  un **error de dominio distinguible `AI_UNAVAILABLE`** (Result/Either del puerto), mapeado por el handler a
  **HTTP 501** con `{code:"AI_UNAVAILABLE", message, agent_action}`; diferente de `SERVICE_UNAVAILABLE`
  (HTTP 503, transitorio/reintentable).
- **FR-002**: La distinción "no operable" vs "transitorio" SHALL hacerse **clasificando el error nativo del
  `execFile`** en el **adaptador** (`claude-cli-provider`): errores de **spawn que impiden ejecutar el
  binario** (`ENOENT` ausente, `EACCES`/`EPERM`/`ENOEXEC` no ejecutable, `ENOTDIR`) → `AI_UNAVAILABLE`;
  errores **tras el spawn** (timeout/`killed`, exit≠0, salida no parseable con el binario presente) →
  `SERVICE_UNAVAILABLE` (transitorio). **No** hay probe separado, **ni caché**, **ni** llamada de red, **ni**
  dependencia del texto del error (se usa `error.code`/`error.syscall` nativos). La decisión vive en
  **infra** (el adaptador); el **dominio permanece puro** (recibe un `DomainError` tipado, sin `child_process`).
- **FR-002b**: WHEN se procesa `ai-summary` THE backend SHALL respetar el **orden heredado de 007/FR-012**
  (no se altera): (1) autenticación (**401**) → (2) rol supervisor (**403**) → (3) **rate-limit** (**429**)
  → (4) visibilidad/estado `pending_review` (**404**, no-enumeración) → (5) gate de material
  (`sufficient:false`, **200**, si insuficiente) → (6) invocación del proveedor (de donde puede surgir
  `AI_UNAVAILABLE`). Un actor no autenticado/no-supervisor/rate-limited/orden-no-visible **nunca** recibe
  `AI_UNAVAILABLE` (recibe 401/403/429/404 antes). *(Nota: 429 precede a 404, orden canónico de 007
  verificado por `ai-summary-access-event`; 018 no lo cambia.)*
- **FR-003**: WHEN la UI de revisión recibe `code:AI_UNAVAILABLE` THE front SHALL mostrar «El resumen por IA
  no está disponible en este entorno», **deshabilitar** el disparador y **no** ofrecer reintento, sin
  bloquear el resto de la revisión (MVP reactivo; ocultación proactiva = stretch).
- **FR-004**: WHILE el proveedor es operable (dev host con `claude` autenticado / `mock`) THE sistema SHALL
  comportarse como hasta ahora (resumen / `sufficient:false` / 429 / 503 transitorio), sin disparar
  `AI_UNAVAILABLE`.
- **FR-005**: El mensaje/`agent_action`/`details` de `AI_UNAVAILABLE` SHALL ser **genérico**: sin nombre de
  binario (`claude`), ruta, versión, ni traza; y el evento de acceso SHALL registrarse con un outcome propio
  (`unavailable`) y **sin PII** (solo `orderId`/código/timestamp) — no debe cargarse ni loguearse el material
  de la orden en este camino. El `outcome` de acceso es el **tipo TS** `AccessOutcome` del logger (pino), no
  un enum de BD → añadir `'unavailable'` **no requiere migración**.
- **FR-006**: El sistema SHALL **no** introducir proveedor de **API de pago** (respeta "sin API de pago");
  `AI_PROVIDER` permanece `claude-cli` (dev) | `mock` (tests). Además, un **guard activo dev-only**
  (**deny-by-default**: se considera operable **solo** cuando `NODE_ENV==='development'` **o**
  `AI_PROVIDER==='mock'`; cualquier otro entorno —pre/prod/staging— trata `claude-cli` como **no operable**)
  SHALL implementarse **dentro del propio adaptador** `claude-cli-provider` (misma ruta que FR-002 → devuelve
  el mismo `DomainError AI_UNAVAILABLE` por el puerto, respetando el orden de FR-002b; **no** un check en el
  handler que pudiera saltarse la precedencia). El guard lee la **config validada e inyectada** al arrancar
  (Zod, fail-fast), **no** `process.env` en el punto de uso, y **no** hace I/O de red. Así "dev-only" no se
  convierte en IA de pago aunque la imagen cambie.
- **FR-007**: El alcance dev-only y el comportamiento desplegado SHALL quedar documentados en
  **`docs/06-roadmap.md`** (BL-072 → cerrado como dev-only), una nota en **`.specify/memory/constitution.md`**
  o ADR, y el mensaje de UI en la tabla de errores de **`docs/design-system.md §8`**.

### Key Entities *(cambio de contrato de puerto)*

Sin entidades de datos nuevas, pero **sí** un cambio de contrato del puerto `AiSummaryProviderPort`: su
`generate()` puede devolver ahora el `DomainError` `AI_UNAVAILABLE` (además de `SERVICE_UNAVAILABLE`). Se
refleja en `docs/traceability.md`.

## Success Criteria *(mandatory)*

- **SC-001**: Con un test-double del puerto (o `AI_PROVIDER` forzado a no operable / guard dev-only activo),
  `ai-summary` de una orden en `pending_review` con material suficiente devuelve **501 `AI_UNAVAILABLE`**
  (no 503). El seam de test es el **puerto inyectable** (fake que devuelve `AI_UNAVAILABLE`), no manipular
  el `PATH` real (determinista, Constitution).
- **SC-002**: Un test confirma que la respuesta serializada de `AI_UNAVAILABLE` **no** contiene `claude`,
  rutas, versión ni traza (mensaje genérico, FR-005).
- **SC-003**: Tests confirman la precedencia (FR-002b) con **códigos exactos** aun con el proveedor no
  operable: no autenticado → **401**; rol no-supervisor → **403**; orden no visible/otro estado → **404**;
  rate-limited → **429**; y en **ninguno** de esos casos el body es `AI_UNAVAILABLE`.
- **SC-004**: Test de componente front: ante `code:AI_UNAVAILABLE`, la UI muestra el mensaje de entorno,
  **deshabilita** el botón y no ofrece reintento.
- **SC-005**: Con proveedor operable (mock), los tests existentes de resumen IA siguen en **verde**
  (0 regresiones) y no se dispara `AI_UNAVAILABLE`.
- **SC-006**: Un test confirma que `AI_PROVIDER` sigue en `{claude-cli,mock}` y que el guard dev-only
  (deny-by-default) trata `claude-cli` como **no operable** cuando la **config inyectada** indica un entorno
  no-dev (el test pasa la config, **sin** mutar `process.env`).
- **SC-007**: Un test confirma que, en el camino `AI_UNAVAILABLE`, se registra el evento de acceso con
  `outcome:'unavailable'` y **solo** `orderId`/código/timestamp (sin notas/evidencia/PII cargadas ni logueadas).
- **SC-008**: `tsc`/`eslint`/`stylelint` y las suites de back y front terminan en verde.

> Verificación determinista (tsc/eslint/vitest, puerto inyectable). El eval de IA (`/evals`) sigue siendo
> **dev-only**; en el entorno desplegado la capacidad se declara no disponible.

## Contrato (OpenAPI) *(cambio menor)*

- `POST /v1/orders/{orderId}/ai-summary`: añadir la respuesta de error **`501`** con
  `{code:"AI_UNAVAILABLE", message, agent_action}` (proveedor no operable en este entorno), **separada** de
  `503 SERVICE_UNAVAILABLE` (transitorio). `error-mapper` mapea `AI_UNAVAILABLE → 501` (Record 1:1). Sin
  cambios en el 200 (`{summary, sufficient}`) ni en el resto de códigos. El front distingue por `body.code`.

## Assumptions

- El objetivo de despliegue (Render, contenedor) no dispone de `claude` ni debe llevar API de pago; la IA es
  dev-only y el entorno desplegado la declara no disponible.
- MVP **reactivo** (UI reacciona a `AI_UNAVAILABLE`); ocultación proactiva a priori = **stretch**.
- No se cambia la lógica de material/no-inventar/PII/rate-limit del resumen (006/007); solo se añade la
  clasificación del error y el guard dev-only.
