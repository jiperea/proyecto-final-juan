# Feature Specification: Front del dispatcher — reasignación en master-detail (FE-3)

**Feature Branch**: `015-front-dispatcher`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "FE-3 · Front del dispatcher (escritorio) — write-side de reasignación sobre el shell de FE-1. El dispatcher reasigna una orden reasignable a otro técnico desde la vista master-detail, consumiendo EXCLUSIVAMENTE el contrato ya existente (feature 004), sin ampliar el backend."

## Contexto y alcance

Slice de **front** que añade el **write-side del dispatcher** sobre el shell de FE-1 (app responsive, sesión/RBAC, capa api, listado + detalle read-only) y los patrones de mutación de FE-2 (invalidación de caché, estado en vuelo accesible, mapeo de errores del contrato a mensaje de UI). El dispatcher trabaja en **escritorio (master-detail)**.

No añade endpoints ni toca el backend: consume el contrato de la feature 004 (`contracts/orders.openapi.yaml`), con los tipos de UI **derivados** del contrato (no redefinidos). Evidencia binaria (deuda #007), aprobar/rechazar (FE-4) y concurrencia optimista `If-Match`/409 (stretch backend BL-001) quedan **fuera de alcance**.

## Clarifications

### Session 2026-07-14

- Q: El contrato no expone endpoint para listar técnicos, pero reasignar exige un `assignee_id` (UUID) válido. ¿Cómo introduce el dispatcher el técnico destino en FE-3? → A: **Entrada manual del identificador validada en formato en cliente + manejo limpio de `INVALID_ASSIGNEE`**, como mecanismo interino; y se **registra formalmente una deuda de backend** (endpoint de listado de técnicos) para sustituir la entrada manual por un selector real en el futuro (regla de atomización XV). El alcance de FE-3 sigue siendo front-only sobre el contrato actual.

### Session 2026-07-14 (remediación gate G1)

- Q: [G1-B01] `assigned_to` es un UUID desnudo (sin nombre) y no hay endpoint de listado; ¿de dónde obtiene el dispatcher el UUID destino en producción? → A: **Fuente externa (fuera de banda)**: el dispatcher lo obtiene por un canal ajeno a la app (roster operativo del equipo, o comunicado por el propio técnico / su responsable). FE-3 **no** resuelve ese lookup; el hint del campo destino lo refleja y SC-001 se reformula como demostrable con un UUID conocido de antemano. La deuda de backend (selector real) ya está registrada.
- Q: [G1-A09] ¿Comportamiento responsive del master-detail por debajo del ancho de escritorio? → A: **Ocultar el control de reasignación** bajo el breakpoint de escritorio ya definido por FE-1 (detalle en solo-lectura); FE-3 es explícitamente de escritorio; no se crea un breakpoint nuevo.
- Q: [G1-A01/A02] Cobertura de errores además de los de negocio → A: incluir **500 / código no contemplado** (mensaje genérico, sin error boundary, con reintento) y **fallo de red/transporte** (mensaje de conectividad distinto, con reintento).
- Q: [G1-A04] Criterio objetivo de "sin recarga completa" → A: sin evento de navegación de documento y **conservación del nodo raíz del shell y del scroll del listado** (identidad de referencia DOM).
- Q: [G1-A05/M07] Foco y anuncio tras éxito → A: mover el foco al elemento del detalle que muestra el nuevo asignatario, `aria-live="polite"`, y el anuncio **nombra al destino**.
- Q: [G1-A06/M12] Persistencia y telemetría de datos sensibles → A: prohibir persistir `reason`/`assignee_id` en `localStorage`/`sessionStorage`/`IndexedDB`/cookies (solo memoria del formulario); la prohibición alcanza también SDKs de telemetría/error-tracking de terceros heredados del shell.
- Q: [G1-A07/M13] Accesibilidad en errores → A: error asociado con `aria-describedby` + `aria-invalid`, perceptible por foco/anuncio; validación de formato del destino **on blur y on submit** (no on-keystroke); caminos de error también gestionan foco/anuncio.
- Q: [G1-A08/M14] Contraste y tap targets → A: ≥4.5:1 texto / ≥3:1 componentes y foco en los estados nuevos, con comprobación dirigida a `disabled`/`focus`; tap targets ≥44×44 px.
- Q: [G1-M02] Panel de detalle tras 404 → A: limpiar el panel (estado vacío), no mantener datos obsoletos; refrescar el listado.
- Q: [G1-M05] Motivo y destino inválidos a la vez → A: mostrar **ambos** errores de campo simultáneamente, sin llamar al backend.
- Q: [G1-M08] Formato UUID a validar → A: **RFC 4122 v1–v5** (no restringido a v4).
- Q: [G1-M11] Límite de intentos ante `INVALID_ASSIGNEE` → A: **responsabilidad del backend** (rate-limit); FE-3 no lo implementa en cliente.

*Convergencia G1 ronda 2 (hallazgos del re-ataque del panel):*

- Q: [r2 H-001] ¿Se normaliza el UUID pegado desde una fuente externa? → A: **sí**, `trim` de espacios/saltos de línea antes de validar el formato (FR-014).
- Q: [r2 H-002] Valor inicial del campo destino → A: **vacío** (no pre-rellenar con el asignatario actual, para no disparar `INVALID_ASSIGNEE` "igual al actual").
- Q: [r2 H-003/F-101] Gating y foco del control de confirmación → A: el control **no** se deshabilita por validez (siempre activable); en vuelo usa `aria-busy`+`aria-disabled` (no `disabled` nativo) para no perder el foco; la validación de cliente corre al enviar (FR-004/FR-014).
- Q: [r2 T-001] `aria-describedby` del campo con ayuda + error → A: **ambos ids coexisten** (el error NO elimina la ayuda de formato) (FR-017).
- Q: [r2 F-102] Estado del formulario tras éxito → A: se **colapsa/cierra**; el detalle vuelve a solo-lectura con el nuevo asignatario (FR-013).
- Q: [r2 F-103] Limpieza del error de campo durante la edición → A: al empezar a editar se limpia `aria-invalid`/mensaje y se re-evalúa en el siguiente blur/submit (FR-017).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reasignar una orden reasignable a otro técnico (Priority: P1)

Un dispatcher ve, en su listado de órdenes activas (`assigned`/`in_progress`), una orden cuyo técnico asignado debe cambiar (no disponible, sobrecarga, cambio de zona). Abre el detalle, indica el técnico destino y un motivo, y confirma la reasignación. La vista refleja el nuevo asignatario **sin recarga completa**, conservando el estado de la orden.

**Why this priority**: Es el propósito de la feature y el criterio "demostrable" del roadmap ("reasigno una orden reasignable a otro técnico"). Sin esto, FE-3 no entrega valor.

**Independent Test**: Con el backend mockeado por contrato, un dispatcher autenticado abre una orden `assigned`, introduce un técnico destino válido y un motivo, confirma y ve el nuevo `assigned_to` reflejado sin recargar, con el estado sin cambio.

**Acceptance Scenarios**:

1. **Given** un dispatcher en el detalle de una orden `assigned` (técnico T1), **When** indica el técnico destino T2 y un motivo válido y confirma, **Then** la petición de reasignación se envía con `{assignee_id, reason}`, y al responder 200 la vista muestra el nuevo asignatario y la versión actualizada sin recarga completa, con el estado sin cambio.
2. **Given** una orden `in_progress`, **When** el dispatcher la reasigna con motivo válido, **Then** el resultado se refleja igual (estado `in_progress` sin cambio) y el detalle/listado quedan consistentes con el nuevo asignatario.
3. **Given** el envío en curso, **When** la petición está en vuelo, **Then** el control de confirmación queda inhabilitado y con estado en vuelo accesible (`aria-busy`), y no se puede reenviar por doble clic ni por teclado.

---

### User Story 2 - Errores mapeados a mensaje de UI, sin efecto ni fuga (Priority: P2)

Cuando la reasignación no se puede aplicar, el dispatcher recibe un mensaje comprensible derivado del contrato de errores, la vista no se rompe (ni error crudo ni error boundary) y no se pierde lo introducido cuando tiene sentido reintentar.

**Why this priority**: La corrección del flujo de error es parte del acceptance del write-side (paridad con FE-2) y de la seguridad (no-enumeración, no fuga del motivo).

**Independent Test**: Inyectando cada código del contrato se observa el mensaje de UI correspondiente y la ausencia de efecto/fuga.

**Acceptance Scenarios**:

1. **Given** una orden inexistente/no visible/no reasignable o un `orderId` malformado, **When** el dispatcher intenta reasignar, **Then** la UI muestra el mismo mensaje genérico (404 indistinguible, no-enumeración) sin revelar cuál de las causas se dio.
2. **Given** un motivo ausente/vacío/solo espacios, **When** intenta confirmar, **Then** la validación en cliente lo impide y, si el backend responde `VALIDATION_ERROR`, el mensaje se asocia al **campo motivo** (no solo a una alerta genérica).
3. **Given** un técnico destino inválido (inexistente / no-technician / deshabilitado / igual al actual), **When** confirma, **Then** la UI muestra el mensaje de `INVALID_ASSIGNEE` y conserva lo introducido para corregir.
4. **Given** un usuario no dispatcher o no autenticado, **When** llega la respuesta, **Then** `FORBIDDEN_ROLE`/401 se manejan como en FE-1/FE-2 (mensaje uniforme / refresco de sesión) sin exponer detalle.

---

### User Story 3 - Ocultación por rol y accesibilidad del flujo (Priority: P3)

La acción de reasignar solo se ofrece al rol dispatcher (doble capa: el backend sigue siendo la autoridad), y el flujo completo es operable por teclado y anunciado a tecnología de asistencia.

**Why this priority**: Consistencia RBAC/a11y con el resto del front; refuerza seguridad y cumplimiento WCAG sin ser el núcleo funcional.

**Independent Test**: Un no-dispatcher no ve el control de reasignación; el flujo se completa solo con teclado y axe no reporta violaciones en los estados nuevos.

**Acceptance Scenarios**:

1. **Given** una sesión de rol technician o supervisor, **When** abre el detalle de una orden, **Then** no se muestra ningún control de reasignación (ocultación por rol).
2. **Given** un dispatcher, **When** reasigna con éxito, **Then** el cambio de asignatario se anuncia en una región viva (el resultado es percibible sin ver el foco) y el foco se gestiona de forma predecible.

---

### Edge Cases

- **Motivo en el límite**: 0 caracteres o solo espacios/controles → bloqueado en cliente; 500 code points → aceptado; 501 → bloqueado en cliente. Caracteres imprimibles contados por code point (no por unidad UTF-16).
- **Reasignación al mismo técnico actual**: el backend responde `INVALID_ASSIGNEE`; la UI lo trata como error de destino, no como éxito.
- **Orden que deja de ser reasignable entre el listado y el envío** (p. ej. pasó a `pending_review`): la respuesta es 404 genérico; la UI muestra el mensaje uniforme, **limpia el panel de detalle abierto** (estado vacío, sin datos obsoletos) y refresca el listado.
- **Doble envío**: el control inhabilitado en vuelo evita una segunda reasignación (last-write-wins en backend; el front no debe provocarlo por UI).
- **Fallo de red/transporte** (timeout, sin conexión, respuesta no-JSON o sin cuerpo `{code,message}`): la UI muestra un mensaje de **conectividad** distinto del mapeo por código de contrato, sin romper la vista y con opción de reintento conservando lo introducido.
- **500 / código no contemplado**: mensaje de error **genérico** (no crudo), sin activar error boundary, con opción de reintento.
- **Motivo y destino inválidos a la vez**: la validación de cliente muestra **ambos** errores de campo simultáneamente, sin llamar al backend.
- **Concurrencia (last-write-wins)**: si otro dispatcher reasigna la misma orden en paralelo, el front no detecta ni indica conflicto; siempre refleja la última respuesta del backend en cada revalidación (no retiene la escritura propia si el backend la sobrescribió).
- **El motivo y el `assignee_id` nunca** aparecen en logs, telemetría del cliente (incluidos SDKs de terceros heredados del shell), almacenamiento del navegador ni en cuerpos de error mostrados.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN una sesión de rol `dispatcher` abre el detalle de una orden en estado `assigned` o `in_progress` THE front SHALL ofrecer una acción de reasignación (formulario con destino y motivo); WHILE el rol no sea `dispatcher` THE front SHALL NO renderizar ningún control de reasignación (ocultación por rol; el backend sigue siendo la autoridad de acceso).
- **FR-002**: WHEN el dispatcher confirma la reasignación con un técnico destino y un motivo válido THE front SHALL enviar `POST /orders/{orderId}/reassignments` con cuerpo `{assignee_id, reason}` conforme al contrato (tipos derivados de `contracts/`, no redefinidos).
- **FR-003**: WHEN la respuesta es 200 THE front SHALL reflejar el nuevo `assigned_to` y la `version` actualizada en el detalle y en el listado **sin recarga completa** (invalidación de caché, patrón de FE-2), conservando el `status` sin cambio. "Sin recarga completa" se verifica de forma objetiva por: (a) ausencia de un evento de navegación de documento (no se recrea el nodo raíz de la app), y (b) conservación del nodo raíz del shell y del scroll del listado (identidad de referencia DOM antes/después). En cualquier revalidación posterior (refetch, navegación de vuelta) THE front SHALL reflejar SIEMPRE el estado que devuelva el backend, sin retener un asignatario escrito por el propio front si el backend ya lo sobrescribió (coherente con last-write-wins; sin indicación de conflicto).
- **FR-004**: WHILE la petición de reasignación está en vuelo THE front SHALL marcar el control de confirmación como ocupado con `aria-busy` y `aria-disabled="true"` (NO `disabled` nativo, para no perder el foco), impidiendo un segundo envío por clic o teclado; el control **no** se deshabilita por validez de campos (siempre es enfocable/activable), solo por estar en vuelo — la validación de cliente se ejecuta al enviar (FR-014/FR-017).
- **FR-005**: WHEN el motivo introducido tiene menos de 1 code point imprimible o más de 500 code points THE front SHALL impedir el envío y señalar el error asociado al campo motivo, sin llamar al backend.
- **FR-006**: WHEN el backend responde `VALIDATION_ERROR` (motivo ausente/vacío/solo whitespace o cuerpo inválido) THE front SHALL asociar el mensaje al campo motivo (no solo a una alerta genérica) y conservar lo introducido.
- **FR-007**: WHEN el backend responde `INVALID_ASSIGNEE` (UUID con formato válido pero destino no asignable) THE front SHALL mostrar el mensaje del contrato **asociado al campo destino** y conservar lo introducido para corregir, sin distinguir la subcausa (inexistente / no-technician / deshabilitado / igual al actual), tratándolo como error de destino y no como éxito. La validación de cliente (FR-014) es solo de formato UUID; la autoridad sobre la validez del destino es el backend.
- **FR-008**: WHEN el backend responde 404 (inexistente / no visible / no reasignable / `orderId` malformado) THE front SHALL mostrar un único mensaje genérico indistinguible (no-enumeración) y refrescar el listado.
- **FR-009**: WHEN el backend responde `FORBIDDEN_ROLE` (403) o 401 THE front SHALL manejarlos como el resto del front (mensaje uniforme / refresco de sesión de FE-1) sin exponer error crudo ni activar un error boundary.
- **FR-010**: WHEN se produce cualquier error de reasignación THE front SHALL mapear `{code,message,details,agent_action}` a un mensaje de UI comprensible y NUNCA mostrar la traza cruda ni romper la vista.
- **FR-011**: THE front SHALL NOT emitir el `reason` ni el `assignee_id` a logs de cliente, telemetría, cuerpos de error visibles, ni a SDKs de telemetría/error-tracking de terceros heredados del shell (breadcrumbs, beacons, snapshots de DOM); y THE front SHALL NOT persistirlos en almacenamiento del navegador (`localStorage`, `sessionStorage`, `IndexedDB`, cookies): solo se conservan en el estado en memoria del formulario durante la edición.
- **FR-012**: THE front SHALL completar todo el flujo de reasignación (foco, activación, introducción de destino y motivo, confirmación, percepción del resultado) operable por teclado, con nombres accesibles y sin usar el color como único portador de información (WCAG 2.1 AA), reutilizando exclusivamente tokens del design system (sin estilos sueltos).
- **FR-013**: WHEN la reasignación termina con éxito THE front SHALL anunciar el resultado en una región `aria-live="polite"` cuyo texto **nombra el asignatario destino** (no un genérico "reasignado"), SHALL mover el foco al elemento del panel de detalle que muestra el nuevo asignatario (foco y anuncio sobre la misma información), y SHALL **colapsar/cerrar el formulario** de reasignación (el detalle vuelve a solo-lectura con el nuevo asignatario; no queda un formulario abierto con valores enviados).
- **FR-014**: WHEN el dispatcher debe indicar el técnico destino THE front SHALL ofrecer un campo de **entrada manual del identificador del técnico**, **inicialmente vacío** (no pre-rellenado con el asignatario actual), con nombre accesible y una ayuda breve que indique que el identificador se obtiene fuera de la app (roster/comunicado del técnico o su responsable) y su formato esperado; THE front SHALL **recortar espacios/saltos de línea** del valor antes de validar y comprobar que tiene **formato UUID (RFC 4122, v1–v5)**, ejecutando la validación **on blur y on submit** (no en cada pulsación); WHEN el valor (ya recortado) no tiene formato UUID al enviar THE front SHALL impedir la llamada al backend y señalar el error asociado al campo destino.
- **FR-015**: WHEN el backend responde 500 o cualquier código no contemplado explícitamente THE front SHALL mostrar un mensaje de error genérico (no crudo), sin activar un error boundary, tratándolo como fallo no recuperable con opción de reintento que conserva lo introducido.
- **FR-016**: WHEN la petición de reasignación falla por transporte (timeout, sin conexión, respuesta no-JSON o sin cuerpo `{code,message}`) THE front SHALL mostrar un mensaje de **conectividad** distinto del mapeo por código de contrato, sin romper la vista, con opción de reintento que conserva lo introducido.
- **FR-017**: WHEN se produce un error de validación de campo (FR-005/FR-006/FR-007/FR-014) THE front SHALL marcar el campo con `aria-invalid="true"` y referenciar **simultáneamente** por `aria-describedby` tanto la ayuda de formato como el texto de error (ids coexistentes; el error NO elimina la ayuda), y SHALL hacerlo perceptible por foco o anuncio en región viva (WCAG 3.3.1 / 4.1.3); WHEN el usuario empieza a editar un campo en error THE front SHALL limpiar `aria-invalid` y el mensaje de error (se re-evalúa en el siguiente blur/submit), para no anunciar un error de un valor ya cambiado; WHEN motivo y destino son inválidos a la vez THE front SHALL señalar **ambos** errores simultáneamente. El límite de intentos ante `INVALID_ASSIGNEE` repetido es responsabilidad del backend (rate-limit); FE-3 no lo implementa en cliente.
- **FR-018**: WHILE el ancho de viewport esté por debajo del breakpoint de escritorio definido por el shell de FE-1 THE front SHALL ocultar el control de reasignación y mostrar el detalle en solo-lectura (FE-3 es explícitamente de escritorio; no se define experiencia de reasignación en móvil/tablet).

### Key Entities

- **Orden (Order)**: entidad ya definida en el contrato; para FE-3 importan `id`, `status` (reasignable si `assigned`/`in_progress`), `assigned_to`, `version`. Solo lectura salvo el efecto de la reasignación.
- **Solicitud de reasignación (ReassignmentRequest)**: dato que viaja al backend — `assignee_id` (UUID del técnico destino) y `reason` (1..500 code points, ≥1 imprimible). Derivada del contrato.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un dispatcher completa el camino feliz (abrir orden reasignable → indicar destino → motivo → confirmar → ver nuevo asignatario) **sin recarga completa** (sin evento de navegación de documento; se conservan el nodo raíz del shell y el scroll del listado) y con el estado de la orden sin cambio, verificado end-to-end con backend mockeado por contrato **y un UUID de técnico destino conocido de antemano (obtenido fuera de banda, ver FR-014)**.
- **SC-002**: El 100% de los códigos del contrato de errores para reasignación se muestran como mensaje de UI mapeado, sin error crudo ni error boundary, verificado por test: 404 genérico, `VALIDATION_ERROR`, `INVALID_ASSIGNEE`, `FORBIDDEN_ROLE`, 401, **500/no contemplado (mensaje genérico)** y **fallo de red/transporte (mensaje de conectividad)**.
- **SC-003**: El escaneo axe sobre los estados nuevos (detalle con acción de reasignar, formulario, en vuelo, error, éxito) reporta **0 violaciones** WCAG 2.1 AA; el flujo es operable por teclado; el **contraste** cumple ≥4.5:1 (texto) y ≥3:1 (componentes de UI e indicador de foco) en los estados destino/motivo/botón (normal, deshabilitado, en vuelo) y mensajes de error, con comprobación dirigida a los estados `disabled`/`focus` que axe no cubre de forma fiable; los controles interactivos cumplen tap target ≥44×44 px.
- **SC-004**: Ningún control de reasignación es visible para roles distintos de `dispatcher` ni por debajo del breakpoint de escritorio (verificado por test de render por rol y por viewport), y el backend permanece como autoridad (el front no decide acceso).
- **SC-005**: El `reason` y el `assignee_id` no aparecen en consola, telemetría (incl. SDKs de terceros) ni en almacenamiento del navegador durante/tras el flujo (verificado con espía de consola **y de storage**), y la validación de cliente rechaza entradas inválidas **antes de llamar al backend**: motivo (1..500 code points, ≥1 imprimible) y destino (formato UUID RFC 4122 v1–v5).

## Contrato (OpenAPI) *(consumido, no creado)*

FE-3 **no crea contrato**; consume el existente `contracts/orders.openapi.yaml` (feature 004). Endpoints relevantes:

- `reassignOrder` — `POST /orders/{orderId}/reassignments` — rol `dispatcher` — respuestas `200` (Order con nuevo `assigned_to`, `status` sin cambio, `version`+1), `404` genérico no-enumerante, `422` (`VALIDATION_ERROR` / `INVALID_ASSIGNEE`), `403` (`FORBIDDEN_ROLE`), `401`.
- `listOrders` — `GET /orders` — dispatcher ve `assigned`/`in_progress`.
- `getOrder` — `GET /orders/{orderId}` — detalle del dispatcher (sin `notes`/`evidence`, mínimo privilegio).
- Esquema `ReassignmentRequest`: `{ assignee_id: uuid, reason: string (1..500 code points, ≥1 imprimible) }`, `additionalProperties: false`.
- Contrato de errores: `{ code, message, details, agent_action }`.

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint(s) | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-001 | `getOrder` (render por rol) | (plan) | `should mostrar reasignar solo a dispatcher` |
| FR-002/003 | `reassignOrder` | (plan) | `should enviar {assignee_id,reason} y reflejar nuevo asignatario sin recarga` |
| FR-004 | `reassignOrder` | (plan) | `should inhabilitar confirmar en vuelo (aria-busy)` |
| FR-005/006 | `reassignOrder` | (plan) | `should validar motivo en cliente y asociar VALIDATION_ERROR al campo` |
| FR-007 | `reassignOrder` | (plan) | `should mapear INVALID_ASSIGNEE al campo destino conservando lo introducido` |
| FR-008 | `reassignOrder` | (plan) | `should mostrar 404 genérico indistinguible y limpiar detalle` |
| FR-009/010 | `reassignOrder` | (plan) | `should mapear FORBIDDEN_ROLE/401 sin error boundary` |
| FR-011 | `reassignOrder` | (plan) | `should no filtrar reason/assignee_id a consola/telemetría/storage` |
| FR-012/013 | — | (plan) | `axe sin violaciones` · `flujo por teclado` · `foco+anuncio nombran destino` |
| FR-014 | — (cliente) | (plan) | `should exigir formato UUID (RFC 4122) on blur/submit` |
| FR-015 | `reassignOrder` | (plan) | `should mostrar error genérico ante 500 sin boundary` |
| FR-016 | `reassignOrder` | (plan) | `should mostrar mensaje de conectividad ante fallo de red` |
| FR-017 | — (cliente) | (plan) | `should asociar error con aria-describedby+aria-invalid y mostrar ambos a la vez` |
| FR-018 | — | (plan) | `should ocultar reasignar bajo el breakpoint de escritorio` |

## Eval de objetivos (promptfoo) *(Constitution XIV)*

- Cada SC medible se codifica como test determinista (Vitest + axe) y, para el camino feliz, e2e por contrato. Sin componente IA → sin golden cases IA (promptfoo N/A para esta feature, coherente con FE-1/FE-2).

## Assumptions

- Se reutilizan el shell, la sesión/RBAC, la capa api (mismo origen `/v1`), el manejo de errores y los patrones de mutación de FE-1/FE-2; el design system ya está definido.
- El backend de la feature 004 (reasignación) está desplegado y su contrato es la única fuente de verdad; FE-3 no lo modifica.
- El dispatcher opera en escritorio (master-detail); la app sigue siendo responsive.
- La concurrencia es last-write-wins (sin `If-Match`/409 en el MVP), por lo que la UI no ofrece resolución de conflictos de versión.
- La subida binaria de evidencia (deuda #007) y las vistas de aprobar/rechazar (FE-4) no forman parte de FE-3.
- **Deuda de backend registrada (clarify 2026-07-14, regla XV)**: no existe endpoint para listar técnicos asignables. FE-3 usa **entrada manual del identificador validada en formato** como mecanismo interino (FR-014); el dispatcher obtiene el UUID **fuera de banda** (roster/comunicado del técnico o su responsable). Se traza una feature/deuda de backend futura (endpoint de listado de técnicos) para sustituir la entrada manual por un **selector real**; su registro en el backlog/roadmap se hace fuera de esta spec. FE-3 no queda bloqueada por ella.
- **Diferido a `plan.md` (anotado, no en silencio — G1 MEDIAS)**: (a) validar que el mock por contrato no diverge del backend 004 real (contract-test/generación desde `contracts/`); (b) riesgo de despliegue por fases (ADR-0004/010): si FE-3 se despliega donde 004 aún no existe, el 404 será de infraestructura, no de negocio → nota de runbook/CD; (c) tabla cerrada de claves i18n de mensajes (una por código, extendiendo el catálogo de FE-2); (d) regla lint/stylelint que verifica "sin estilos sueltos" (FR-012); (e) mecanismo concreto de verificación de telemetría (espía) según el SDK real del shell de FE-1.
