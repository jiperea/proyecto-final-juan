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

Un supervisor usa el producto **desplegado** (contenedor, sin proveedor IA). Al abrir la revisión de una
orden, **no se le ofrece** un botón de resumen IA que va a fallar; o si lo intenta, ve un mensaje claro:
**«El resumen por IA no está disponible en este entorno»**, **sin** invitación a reintentar (porque no
procede). Nada se cuelga y el resto de la revisión (aprobar/rechazar) funciona con normalidad.

**Why this priority**: Es el núcleo del encargo: hoy el producto desplegado miente ("Reinténtalo") sobre
una capacidad que nunca responderá en ese entorno.

**Independent Test**: Con el proveedor no operable (binario ausente / `AI_PROVIDER` no operable), la UI de
revisión no presenta un reintento de IA accionable y muestra el mensaje de indisponibilidad de entorno; el
backend responde con una **señal distinguible** (código propio), no con el 503 transitorio genérico.

**Acceptance Scenarios**:

1. **Given** un entorno sin proveedor IA operable, **When** se solicita el resumen de una orden con material
   suficiente, **Then** el backend responde con un **código distinguible** (p. ej. `AI_UNAVAILABLE`) que
   significa "no disponible en este entorno" (no `SERVICE_UNAVAILABLE` transitorio con reintento).
2. **Given** ese código, **When** la UI lo recibe, **Then** muestra «El resumen por IA no está disponible en
   este entorno» y **no** ofrece reintento de IA (ni deja el botón como si fuera a funcionar).
3. **Given** ese mismo entorno, **When** el supervisor revisa la orden, **Then** aprobar/rechazar y el resto
   de la vista siguen operativos (la indisponibilidad de IA no bloquea la revisión).

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

- **Fallo transitorio real del proveedor** (timeout, crash puntual con el binario presente): sigue siendo
  `SERVICE_UNAVAILABLE` **con** reintento (distinto de "no disponible en este entorno").
- **`AI_PROVIDER=mock`** (tests): operable; nunca dispara el código de indisponibilidad.
- **Material insuficiente en entorno sin proveedor**: prevalece el gate de material (`sufficient:false`) o
  la indisponibilidad — se define un orden determinista (ver FR-002).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN el proveedor IA no es operable en el entorno (binario `claude` ausente o `AI_PROVIDER`
  sin adaptador operativo) THE backend SHALL responder a `ai-summary` con un **código de error
  distinguible y no-reintentable** (p. ej. `AI_UNAVAILABLE`) en el contrato de error
  `{code, message, agent_action}`, diferente de `SERVICE_UNAVAILABLE` (transitorio, reintentable).
- **FR-002**: La detección de "no operable" SHALL ser **determinista** (comprobación de disponibilidad del
  proveedor al arrancar o en el primer uso, cacheada), sin depender de adivinar por el texto del error; y
  su precedencia respecto al gate de material insuficiente SHALL quedar definida (recomendado: material
  primero si es evaluable sin proveedor; si no, indisponibilidad).
- **FR-003**: WHEN la UI de revisión recibe el código de indisponibilidad THE front SHALL mostrar
  «El resumen por IA no está disponible en este entorno» y **no** ofrecer un reintento de IA accionable
  (ocultar o deshabilitar el disparador), sin bloquear el resto de la revisión.
- **FR-004**: WHILE el proveedor es operable (dev host / mock) THE sistema SHALL comportarse como hasta
  ahora (resumen / `sufficient:false` / 429 / 503 transitorio), sin disparar el código de indisponibilidad.
- **FR-005**: El sistema SHALL **no** introducir ningún proveedor de **API de pago** (respeta "sin API de
  pago"); `AI_PROVIDER` permanece `claude-cli` (dev) | `mock` (tests).
- **FR-006**: El alcance dev-only y el comportamiento del entorno desplegado SHALL quedar **documentados**
  (constitución/roadmap + `docs`), cerrando **BL-072** como decisión dev-only (no proveedor de producción).

### Key Entities *(no aplica)*

Sin entidades nuevas. Reutiliza el contrato de error existente y la config de IA.

## Success Criteria *(mandatory)*

- **SC-001**: En un entorno **sin** proveedor operable, `ai-summary` con material suficiente devuelve el
  código de indisponibilidad distinguible (no `SERVICE_UNAVAILABLE`); verificado por test (proveedor
  simulado como no operable).
- **SC-002**: Dado el código de indisponibilidad, la UI **no** renderiza un reintento de IA accionable y
  muestra el mensaje de entorno; verificado por test de componente.
- **SC-003**: Con proveedor operable (mock), los tests existentes de resumen IA siguen en **verde**
  (0 regresiones) y no se dispara el código de indisponibilidad.
- **SC-004**: `AI_PROVIDER` sigue restringido a `claude-cli`/`mock`; no se añade dependencia ni ruta de API
  de pago (verificable por inspección/config).
- **SC-005**: `tsc`/`eslint`/`stylelint` y las suites de back y front terminan en verde.

> Verificación determinista (tsc/eslint/vitest). El componente IA se sigue evaluando por su eval existente
> (`/evals`) **solo en dev**; en el entorno desplegado la capacidad está declarada no disponible.

## Contrato (OpenAPI) *(cambio menor)*

- `POST /v1/orders/{orderId}/ai-summary`: añadir/clarificar en las respuestas de error el **código
  `AI_UNAVAILABLE`** (503 con `code` distinguible, o el código HTTP que decida el plan) para "proveedor no
  operable en este entorno", separado de `SERVICE_UNAVAILABLE` (transitorio). Sin cambios en el 200
  (`{summary, sufficient}`) ni en el resto de códigos.

## Assumptions

- El objetivo de despliegue (Render, contenedor) no dispone de `claude` ni debe llevar API de pago; por eso
  la IA es dev-only y el entorno desplegado la declara no disponible.
- Reactivo vs proactivo: basta con que la UI reaccione al código de indisponibilidad (ocultar/deshabilitar
  tras la primera señal). Un endpoint/capability de disponibilidad *a priori* (para ocultar el botón antes
  de pulsarlo) es **opcional** (stretch), no requerido por el MVP de esta feature.
- No se cambia la lógica de material/no-inventar/PII/rate-limit del resumen (features 006/007).
