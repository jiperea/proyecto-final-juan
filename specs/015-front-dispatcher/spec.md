# Feature Specification: Front del dispatcher — reasignación en master-detail (FE-3)

**Feature Branch**: `015-front-dispatcher`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "FE-3 · Front del dispatcher (escritorio) — write-side de reasignación sobre el shell de FE-1. El dispatcher reasigna una orden reasignable a otro técnico desde la vista master-detail, consumiendo EXCLUSIVAMENTE el contrato ya existente (feature 004), sin ampliar el backend."

## Contexto y alcance

Slice de **front** que añade el **write-side del dispatcher** sobre el shell de FE-1 (app responsive, sesión/RBAC, capa api, listado + detalle read-only) y los patrones de mutación de FE-2 (invalidación de caché, estado en vuelo accesible, mapeo de errores del contrato a mensaje de UI). El dispatcher trabaja en **escritorio (master-detail)**.

No añade endpoints ni toca el backend: consume el contrato de la feature 004 (`contracts/orders.openapi.yaml`), con los tipos de UI **derivados** del contrato (no redefinidos). Evidencia binaria (deuda #007), aprobar/rechazar (FE-4) y concurrencia optimista `If-Match`/409 (stretch backend BL-001) quedan **fuera de alcance**.

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
- **Orden que deja de ser reasignable entre el listado y el envío** (p. ej. pasó a `pending_review`): la respuesta es 404 genérico; la UI muestra el mensaje uniforme y refresca el listado.
- **Doble envío**: el control inhabilitado en vuelo evita una segunda reasignación (last-write-wins en backend; el front no debe provocarlo por UI).
- **El motivo nunca** aparece en logs, telemetría del cliente ni en cuerpos de error mostrados.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN una sesión de rol `dispatcher` abre el detalle de una orden en estado `assigned` o `in_progress` THE front SHALL ofrecer una acción de reasignación (formulario con destino y motivo); WHILE el rol no sea `dispatcher` THE front SHALL NO renderizar ningún control de reasignación (ocultación por rol; el backend sigue siendo la autoridad de acceso).
- **FR-002**: WHEN el dispatcher confirma la reasignación con un técnico destino y un motivo válido THE front SHALL enviar `POST /orders/{orderId}/reassignments` con cuerpo `{assignee_id, reason}` conforme al contrato (tipos derivados de `contracts/`, no redefinidos).
- **FR-003**: WHEN la respuesta es 200 THE front SHALL reflejar el nuevo `assigned_to` y la `version` actualizada en el detalle y en el listado **sin recarga completa** (invalidación de caché, patrón de FE-2), conservando el `status` sin cambio.
- **FR-004**: WHILE la petición de reasignación está en vuelo THE front SHALL inhabilitar el control de confirmación y exponer estado en vuelo accesible (`aria-busy`), impidiendo un segundo envío por clic o teclado.
- **FR-005**: WHEN el motivo introducido tiene menos de 1 code point imprimible o más de 500 code points THE front SHALL impedir el envío y señalar el error asociado al campo motivo, sin llamar al backend.
- **FR-006**: WHEN el backend responde `VALIDATION_ERROR` (motivo ausente/vacío/solo whitespace o cuerpo inválido) THE front SHALL asociar el mensaje al campo motivo (no solo a una alerta genérica) y conservar lo introducido.
- **FR-007**: WHEN el backend responde `INVALID_ASSIGNEE` THE front SHALL mostrar el mensaje del contrato para destino inválido y conservar lo introducido para corregir, sin distinguir la subcausa (inexistente / no-technician / deshabilitado / igual al actual).
- **FR-008**: WHEN el backend responde 404 (inexistente / no visible / no reasignable / `orderId` malformado) THE front SHALL mostrar un único mensaje genérico indistinguible (no-enumeración) y refrescar el listado.
- **FR-009**: WHEN el backend responde `FORBIDDEN_ROLE` (403) o 401 THE front SHALL manejarlos como el resto del front (mensaje uniforme / refresco de sesión de FE-1) sin exponer error crudo ni activar un error boundary.
- **FR-010**: WHEN se produce cualquier error de reasignación THE front SHALL mapear `{code,message,details,agent_action}` a un mensaje de UI comprensible y NUNCA mostrar la traza cruda ni romper la vista.
- **FR-011**: THE front SHALL NOT emitir el `reason` ni datos del destino a logs de cliente, telemetría ni cuerpos de error visibles.
- **FR-012**: THE front SHALL completar todo el flujo de reasignación (foco, activación, introducción de destino y motivo, confirmación, percepción del resultado) operable por teclado, con nombres accesibles y sin usar el color como único portador de información (WCAG 2.1 AA), reutilizando exclusivamente tokens del design system (sin estilos sueltos).
- **FR-013**: WHEN la reasignación termina con éxito THE front SHALL anunciar el cambio de asignatario en una región viva (perceptible por lector de pantalla) y gestionar el foco de forma predecible.
- **FR-014** *(a resolver en `/speckit-clarify` + gate G1)*: WHEN el dispatcher debe indicar el técnico destino THE front SHALL obtener/validar el `assignee_id` [NEEDS CLARIFICATION: el contrato NO expone endpoint para listar técnicos destino, pero la reasignación exige un `assignee_id` (UUID) y el backend responde `INVALID_ASSIGNEE` si no es válido. ¿Cómo introduce el dispatcher el destino? Opciones: (A) entrada manual de UUID validada en formato en cliente + manejo limpio de `INVALID_ASSIGNEE`; (B) declarar el listado de técnicos como dependencia/deuda de backend fuera del alcance de FE-3, entregando FE-3 con entrada manual como interino; (C) otra fuente ya disponible en el contrato. Decide el mecanismo y su UX].

### Key Entities

- **Orden (Order)**: entidad ya definida en el contrato; para FE-3 importan `id`, `status` (reasignable si `assigned`/`in_progress`), `assigned_to`, `version`. Solo lectura salvo el efecto de la reasignación.
- **Solicitud de reasignación (ReassignmentRequest)**: dato que viaja al backend — `assignee_id` (UUID del técnico destino) y `reason` (1..500 code points, ≥1 imprimible). Derivada del contrato.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un dispatcher completa el camino feliz (abrir orden reasignable → indicar destino → motivo → confirmar → ver nuevo asignatario) **sin recarga completa de página** y con el estado de la orden sin cambio, verificado end-to-end con backend mockeado por contrato.
- **SC-002**: El 100% de los códigos de error del contrato para reasignación (404 genérico, `VALIDATION_ERROR`, `INVALID_ASSIGNEE`, `FORBIDDEN_ROLE`, 401) se muestran como mensaje de UI mapeado, sin error crudo ni error boundary, verificado por test.
- **SC-003**: El escaneo axe sobre las pantallas/estados nuevos (detalle con acción de reasignar, formulario, estado en vuelo, estado de error) reporta **0 violaciones** WCAG 2.1 AA, y el flujo completo es operable por teclado.
- **SC-004**: Ningún control de reasignación es visible para roles distintos de `dispatcher` (verificado por test de render por rol), y el backend permanece como autoridad (el front no decide acceso).
- **SC-005**: El `reason` no aparece en salida de consola/telemetría durante el flujo de reasignación (verificado con espía de consola), y la validación de cliente (1..500 code points, ≥1 imprimible) rechaza entradas inválidas antes de llamar al backend.

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
| FR-007 | `reassignOrder` | (plan) | `should mapear INVALID_ASSIGNEE conservando lo introducido` |
| FR-008 | `reassignOrder` | (plan) | `should mostrar 404 genérico indistinguible` |
| FR-009/010 | `reassignOrder` | (plan) | `should mapear FORBIDDEN_ROLE/401 sin error boundary` |
| FR-011 | `reassignOrder` | (plan) | `should no filtrar reason a consola` |
| FR-012/013 | — | (plan) | `axe sin violaciones` · `flujo por teclado` · `anuncio en región viva` |

## Eval de objetivos (promptfoo) *(Constitution XIV)*

- Cada SC medible se codifica como test determinista (Vitest + axe) y, para el camino feliz, e2e por contrato. Sin componente IA → sin golden cases IA (promptfoo N/A para esta feature, coherente con FE-1/FE-2).

## Assumptions

- Se reutilizan el shell, la sesión/RBAC, la capa api (mismo origen `/v1`), el manejo de errores y los patrones de mutación de FE-1/FE-2; el design system ya está definido.
- El backend de la feature 004 (reasignación) está desplegado y su contrato es la única fuente de verdad; FE-3 no lo modifica.
- El dispatcher opera en escritorio (master-detail); la app sigue siendo responsive.
- La concurrencia es last-write-wins (sin `If-Match`/409 en el MVP), por lo que la UI no ofrece resolución de conflictos de versión.
- La subida binaria de evidencia (deuda #007) y las vistas de aprobar/rechazar (FE-4) no forman parte de FE-3.
