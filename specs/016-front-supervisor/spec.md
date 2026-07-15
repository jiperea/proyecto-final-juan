# Feature Specification: Front del supervisor — revisión + resumen IA (FE-4)

**Feature Branch**: `016-front-supervisor`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "FE-4 · Front del supervisor (escritorio) — revisar (aprobar/rechazar) una orden en pending_review + panel de resumen IA de apoyo, sobre el shell de FE-1, consumiendo los contratos 006 (reviewOrder) y 007 (summarizeOrderIncident) sin ampliar el backend."

## Contexto y alcance

Slice de **front** que añade el **write-side del supervisor** sobre el shell de FE-1 (app responsive, sesión/RBAC, capa api, listado + detalle read-only con notas/evidencia) y los patrones de mutación de FE-2/FE-3 (invalidación de caché, estado en vuelo accesible, mapeo de errores del contrato a mensaje de UI). El supervisor trabaja en **escritorio (master-detail)**.

Cierra los ítems 3 (aprobar/rechazar) y 5 (resumen IA) del brief en la UI. No añade endpoints ni toca el backend: consume el contrato de las features 006 y 007 (`contracts/orders.openapi.yaml`), con los tipos de UI **derivados** del contrato (no redefinidos). La **lógica y el eval de la IA** (faithfulness, no-alucinación, no-PII) son responsabilidad del backend 007 y se evalúan allí con promptfoo; FE-4 **solo muestra** el resultado. Concurrencia optimista `If-Match`/409, subida binaria de evidencia (deuda #007), dashboard de métricas y notificaciones push quedan **fuera de alcance**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aprobar o rechazar una orden en revisión (Priority: P1)

Un supervisor abre una orden en `pending_review`, revisa las notas y la evidencia de la ejecución, y decide: **aprobar** (la orden pasa a `closed`) o **rechazar** con un motivo obligatorio (vuelve a `in_progress`). El resultado se refleja **sin recarga completa**.

**Why this priority**: Es el propósito de la feature y el criterio "demostrable" del roadmap ("reviso, apruebo/rechazo con motivo"). Sin esto, FE-4 no entrega valor.

**Independent Test**: Con el backend mockeado por contrato, un supervisor autenticado abre una orden `pending_review`, aprueba → ve `closed` sin recargar; y en otra, rechaza con motivo → ve `in_progress` sin recargar.

**Acceptance Scenarios**:

1. **Given** un supervisor en el detalle de una orden `pending_review` (con notas y evidencia), **When** aprueba, **Then** se envía `{decision:'approve'}`, y al responder 200 la vista muestra el nuevo estado `closed` y la versión actualizada sin recarga completa.
2. **Given** la misma orden, **When** rechaza con un motivo válido, **Then** se envía `{decision:'reject', reason}`, y al responder 200 la vista muestra `in_progress` sin recarga completa.
3. **Given** un intento de rechazo sin motivo (o solo espacios), **When** confirma, **Then** la validación en cliente lo impide y señala el error asociado al **campo motivo**, sin llamar al backend.
4. **Given** el envío en curso, **When** la petición está en vuelo, **Then** los controles de decisión quedan con estado en vuelo accesible (`aria-busy`) y no se puede reenviar por doble clic ni teclado.

---

### User Story 2 - Resumen IA de apoyo a la revisión (Priority: P2)

El supervisor puede pedir un **resumen** en lenguaje natural de la incidencia (generado por el backend a partir de las notas/evidencia) para no leerlo todo. Si el material no es suficiente, la UI dice honestamente que **no se puede resumir** y **no inventa**.

**Why this priority**: Es el componente IA del brief (ítem 5); apoya la decisión de US1 pero no la bloquea (la revisión funciona sin resumen).

**Independent Test**: Con el endpoint mockeado, pedir el resumen muestra el texto cuando `sufficient=true`; cuando `sufficient=false` muestra el mensaje honesto sin texto inventado; y los estados 429/503 se muestran como mensajes distintos.

**Acceptance Scenarios**:

1. **Given** una orden `pending_review`, **When** el supervisor solicita el resumen y el backend responde `{sufficient:true, summary}`, **Then** la UI muestra el `summary` en una región legible, distinguido de las notas originales.
2. **Given** la misma acción, **When** el backend responde `{sufficient:false, summary:null}`, **Then** la UI muestra un mensaje honesto ("no hay material suficiente para resumir; no se genera un resumen") sin revelar la subcausa y sin inventar texto.
3. **Given** el rate-limit superado, **When** solicita el resumen, **Then** la UI muestra el mensaje de `RATE_LIMITED` indicando la espera (cabecera `Retry-After`) y no reintenta automáticamente.
4. **Given** un timeout/indisponibilidad del proveedor (503), **When** solicita el resumen, **Then** la UI muestra un mensaje de "no disponible, reinténtalo" y permite reintentar, sin romper la vista ni bloquear la revisión.

---

### User Story 3 - Ocultación por rol/viewport y accesibilidad (Priority: P3)

Las acciones de revisión y el panel IA solo se ofrecen al rol supervisor (doble capa: el backend sigue siendo la autoridad) en escritorio, y todo el flujo es operable por teclado y anunciado a tecnología de asistencia.

**Why this priority**: Consistencia RBAC/a11y con el resto del front.

**Independent Test**: Un no-supervisor no ve controles de revisión ni el panel IA; el flujo se completa solo con teclado y axe no reporta violaciones en los estados nuevos.

**Acceptance Scenarios**:

1. **Given** una sesión de rol technician o dispatcher, **When** abre el detalle de una orden, **Then** no se muestran controles de revisión ni el panel de resumen IA.
2. **Given** un supervisor, **When** aprueba/rechaza con éxito o recibe el resumen, **Then** el resultado se anuncia en una región viva (perceptible sin ver el foco) y el foco se gestiona de forma predecible.

---

### Edge Cases

- **Aprobar sin evidencia**: el backend responde `409 EVIDENCE_MISSING` (invariante de 005); la UI lo muestra como error de la acción (no se puede aprobar sin evidencia) y no como éxito.
- **Motivo en el límite**: 0/solo espacios → bloqueado en cliente; 1000 code points → aceptado; 1001 → bloqueado en cliente. Contado por code point.
- **Orden que deja de estar en `pending_review`** (otro supervisor ya decidió, o cambió) entre el listado y el envío: `404` genérico → mensaje uniforme, limpiar el detalle y refrescar el listado.
- **`sufficient=false`**: la UI distingue por el campo `sufficient` (no por heurística del texto); nunca muestra un resumen fabricado.
- **429 en el resumen**: no reintentar automáticamente; indicar la espera (`Retry-After`).
- **El motivo del rechazo y el texto del resumen** nunca aparecen en logs, telemetría del cliente ni en almacenamiento del navegador.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN una sesión de rol `supervisor` abre el detalle de una orden en estado `pending_review` THE front SHALL ofrecer los controles de **aprobar** y **rechazar** (con campo de motivo); WHILE el rol no sea `supervisor` THE front SHALL NO renderizar controles de revisión ni el panel de resumen IA (ocultación por rol; el backend es la autoridad).
- **FR-002**: WHEN el supervisor aprueba THE front SHALL enviar `POST /orders/{orderId}/review` con `{decision:'approve'}` (tipos derivados de `contracts/`); WHEN rechaza con motivo válido THE front SHALL enviar `{decision:'reject', reason}`.
- **FR-003**: WHEN la respuesta es 200 THE front SHALL reflejar el nuevo estado (`closed` en approve, `in_progress` en reject) y la `version` en el detalle y el listado **sin recarga completa** (invalidación de caché; criterio objetivo: sin evento de navegación de documento y conservando el nodo raíz del shell y el scroll del listado), reflejando siempre la última respuesta del backend.
- **FR-004**: WHEN el motivo de un rechazo tiene menos de 1 code point imprimible o más de 1000 code points THE front SHALL impedir el envío y señalar el error asociado al campo motivo, sin llamar al backend.
- **FR-005**: WHILE una decisión de revisión está en vuelo THE front SHALL marcar los controles con `aria-busy` y `aria-disabled` (no `disabled` nativo, para no perder el foco), impidiendo un segundo envío por clic o teclado.
- **FR-006**: WHEN el backend responde `422 INVALID_REASON` (rechazo sin motivo / vacío tras saneo / longitud fuera de 1..1000) THE front SHALL asociar el mensaje al campo motivo y conservar lo introducido; WHEN responde `422 VALIDATION_ERROR` THE front SHALL mostrar el mensaje mapeado sin romper la vista.
- **FR-007**: WHEN el backend responde `409 EVIDENCE_MISSING` (solo en approve) THE front SHALL mostrar el mensaje del contrato (no se puede aprobar sin evidencia) como error de la acción, sin tratarlo como éxito.
- **FR-008**: WHEN el backend responde `404` (inexistente / malformado / estado ≠ pending_review) THE front SHALL mostrar un único mensaje genérico indistinguible (no-enumeración), limpiar el panel de detalle y refrescar el listado.
- **FR-009**: WHEN el backend responde `FORBIDDEN_ROLE` (403) o 401 THE front SHALL manejarlos como el resto del front (mensaje uniforme / refresco de sesión) sin exponer error crudo ni activar error boundary; WHEN responde 500 o 503 THE front SHALL mostrar un mensaje genérico/de indisponibilidad con opción de reintento.
- **FR-010**: WHEN el supervisor solicita el resumen IA THE front SHALL enviar `POST /orders/{orderId}/ai-summary` y, al responder 200, distinguir SOLO por `sufficient`: `true` → mostrar `summary` en una región legible diferenciada de las notas; `false` → mostrar un mensaje honesto de que no se puede resumir, **sin inventar texto** y sin revelar la subcausa.
- **FR-011**: WHEN el backend responde `429 RATE_LIMITED` al resumen THE front SHALL mostrar el mensaje indicando la espera (usando `Retry-After`) y NO reintentar automáticamente; WHEN responde `503` THE front SHALL mostrar "no disponible" con opción de reintento manual; en ningún caso el fallo del resumen bloquea la revisión (US1).
- **FR-012**: THE front SHALL NOT emitir el `reason` del rechazo ni el texto del `summary` a logs de cliente, telemetría (incl. SDKs de terceros del shell) ni almacenamiento del navegador (`localStorage`/`sessionStorage`/`IndexedDB`/cookies); solo viven en memoria durante la sesión de la vista.
- **FR-013**: THE front SHALL completar el flujo (foco, activación, motivo, decisión, solicitud/lectura del resumen, percepción del resultado) operable por teclado, con nombres accesibles, contraste ≥4.5:1 (texto)/≥3:1 (componentes y foco), tap targets ≥44px, sin color como único portador (WCAG 2.1 AA), usando solo tokens del design system (sin estilos sueltos).
- **FR-014**: WHEN una decisión o el resumen terminan THE front SHALL anunciar el resultado en una región `aria-live="polite"` (nombrando el nuevo estado, o indicando que el resumen está disponible / no disponible) y gestionar el foco de forma predecible; los errores de campo se asocian con `aria-describedby` + `aria-invalid`.
- **FR-015**: WHILE el ancho de viewport esté por debajo del breakpoint de escritorio de FE-1 THE front SHALL ocultar los controles de revisión y el panel IA (FE-4 es de escritorio; sin experiencia de revisión en móvil).
- **FR-016** *(a resolver en `/speckit-clarify` + G1)*: [NEEDS CLARIFICATION: ¿el resumen IA se solicita **bajo demanda** (botón "Resumir con IA") o **automáticamente** al abrir el detalle? Impacta el rate-limit (10/60 s), coste y UX].
- **FR-017** *(a resolver en `/speckit-clarify` + G1)*: [NEEDS CLARIFICATION: ¿la **aprobación** (transición irreversible a `closed`) requiere confirmación explícita en la UI (anti-fat-finger) o es directa? El rechazo ya exige motivo].

### Key Entities

- **Orden (Order)**: entidad del contrato; para FE-4 importan `id`, `status` (revisable si `pending_review`), `notes`, `evidence` (count + content_types), `last_rejection_reason`, `version`. Solo lectura salvo el efecto de la decisión.
- **Decisión de revisión (ReviewRequest)**: `decision` (`approve`|`reject`) y `reason` (obligatorio en reject, 1..1000 code points, ≥1 imprimible). Derivada del contrato.
- **Resumen de incidencia (IncidentSummaryResponse)**: `sufficient` (boolean) y `summary` (string ≤1200 code points | null). Derivada del contrato; no se persiste en cliente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un supervisor completa el camino feliz de aprobar (→`closed`) y de rechazar con motivo (→`in_progress`) **sin recarga completa**, verificado end-to-end con backend mockeado por contrato.
- **SC-002**: El 100% de los códigos del contrato para revisión (422 VALIDATION_ERROR, 422 INVALID_REASON, 409 EVIDENCE_MISSING, 404, 403, 401, 500, 503) y para el resumen (200 sufficient true/false, 429, 503, 404/403/401) se muestran como mensaje de UI mapeado, sin error crudo ni error boundary, verificado por test.
- **SC-003**: El escaneo axe sobre los estados nuevos (detalle con acciones de revisión, campo motivo, panel IA en sus estados —vacío/cargando/con-resumen/sin-material/error—, en vuelo, error) reporta **0 violaciones** WCAG 2.1 AA; el flujo es operable por teclado; contraste ≥4.5:1/≥3:1 (con comprobación dirigida a disabled/focus) y tap targets ≥44px.
- **SC-004**: Ningún control de revisión ni el panel IA es visible para roles distintos de `supervisor` ni por debajo del breakpoint de escritorio (verificado por test de render por rol y por viewport); el backend permanece como autoridad.
- **SC-005**: Cuando el backend responde `sufficient=false`, la UI **nunca** muestra un texto de resumen (verificado por test: no se renderiza `summary` fabricado; se muestra el mensaje honesto). El cliente decide por el campo `sufficient`, no por el contenido.
- **SC-006**: El `reason` del rechazo y el `summary` no aparecen en consola/telemetría ni en almacenamiento del navegador durante/tras el flujo (verificado con espía de consola y de storage); la validación de cliente del motivo (1..1000 code points, ≥1 imprimible) rechaza entradas inválidas antes de llamar al backend.

## Contrato (OpenAPI) *(consumido, no creado)*

FE-4 **no crea contrato**; consume el existente `contracts/orders.openapi.yaml` (features 006 y 007):

- `reviewOrder` — `POST /orders/{orderId}/review` — rol `supervisor` — `200` Order (approve→closed | reject→in_progress; version+1), `422` (VALIDATION_ERROR/INVALID_REASON), `409` (EVIDENCE_MISSING, solo approve), `404` genérico, `403`, `401`, `500`, `503`.
- `summarizeOrderIncident` — `POST /orders/{orderId}/ai-summary` — rol `supervisor` — `200` IncidentSummaryResponse `{sufficient, summary|null}`, `429` (RATE_LIMITED + Retry-After), `503` (timeout/proveedor), `404`, `403`, `401`, `500`.
- `getOrderDetail` — `GET /orders/{orderId}` — el supervisor ve `pending_review` con `notes`/`evidence`/`last_rejection_reason`.
- Esquemas `ReviewRequest` (`decision`, `reason`) e `IncidentSummaryResponse` (`sufficient`, `summary`). Contrato de errores `{code,message,details,agent_action}`.

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint(s) | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-001/015 | `getOrderDetail` (render por rol/viewport) | (plan) | `should mostrar revisión solo a supervisor en escritorio` |
| FR-002/003 | `reviewOrder` | (plan) | `should aprobar→closed y rechazar→in_progress sin recarga` |
| FR-004/006 | `reviewOrder` | (plan) | `should validar motivo en cliente y mapear INVALID_REASON al campo` |
| FR-005 | `reviewOrder` | (plan) | `should marcar aria-busy/aria-disabled en vuelo` |
| FR-007 | `reviewOrder` | (plan) | `should mostrar EVIDENCE_MISSING en approve` |
| FR-008/009 | `reviewOrder` | (plan) | `should mostrar 404 genérico y limpiar detalle; 403/401/500/503 mapeados` |
| FR-010 | `summarizeOrderIncident` | (plan) | `should mostrar summary si sufficient=true; mensaje honesto si false` |
| FR-011 | `summarizeOrderIncident` | (plan) | `should mapear 429 (Retry-After) y 503 sin bloquear la revisión` |
| FR-012 | ambos | (plan) | `should no filtrar reason/summary a consola/telemetría/storage` |
| FR-013/014 | — | (plan) | `axe sin violaciones` · `teclado` · `foco+anuncio` · `aria-describedby+aria-invalid` |

## Eval de objetivos (promptfoo) *(Constitution XIV)*

- Cada SC medible se codifica como test determinista (Vitest + axe) y, para el camino feliz, e2e por contrato. La **faithfulness/no-alucinación/no-PII de la IA se evalúan en el backend 007** (promptfoo allí); en FE-4 promptfoo es **N/A** (solo se muestra el resultado). SC-005 verifica el contrato de UI del `sufficient=false` (no inventar), no la calidad del resumen.

## Assumptions

- Se reutilizan el shell, la sesión/RBAC, la capa api, el i18n de errores y los patrones de mutación de FE-1/FE-2/FE-3; el design system ya está definido.
- El backend de 006 y 007 está desplegado y su contrato es la única fuente de verdad; FE-4 no lo modifica.
- El supervisor opera en escritorio (master-detail); la app sigue siendo responsive.
- La concurrencia es last-write-wins (sin `If-Match`/409 optimista en el MVP).
- La calidad/seguridad del resumen (no-alucinación, no-PII) la garantiza el backend 007; FE-4 confía en `sufficient` y no re-evalúa el texto.
