# Feature Specification: Visor ampliado de evidencia (lightbox + carrusel)

**Feature Branch**: `025-evidence-viewer-lightbox`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Visor ampliado de evidencia (lightbox + carrusel) en el detalle de orden para técnico y supervisor. Al pulsar una evidencia, abrir un popup/modal a tamaño completo con la imagen real servida por getOrderEvidence, reutilizando el fetch→blob existente sin exponer la URL del endpoint en el DOM. Con varias evidencias: carrusel con anterior/siguiente e indicador «N de total». Cierre con Esc, click en backdrop y botón cerrar. Accesibilidad WCAG 2.1 AA (foco atrapado, retorno de foco, role=dialog/aria-modal, teclado, prefers-reduced-motion). Solo frontend — no toca backend/contratos/RBAC. Además, cambio dev-only en el seed: guardar un blob de imagen real vía StoragePort para que la evidencia sembrada sea visible en dev."

## Contexto

La feature **024** (evidencia binaria) dejó el detalle de orden mostrando cada evidencia como un *tile* «Ver imagen N» que, al pulsarlo, descarga el blob y pinta la imagen **dentro del tile** (pequeña, incrustada). Falta la capa de **visualización ampliada**: al pulsar no se abre nada a tamaño completo ni hay forma de navegar entre varias fotos. Además, la evidencia del **seed de desarrollo** crea la fila de metadatos pero **no guarda blob**, así que `getOrderEvidence` responde 410 y en dev nunca se ve una imagen real (hay que subir una foto a mano para comprobarlo). Esta feature añade el visor ampliado (lightbox + carrusel) y hace visible la evidencia sembrada en dev. **No cambia backend, contrato, RBAC ni el endpoint**: reutiliza el flujo fetch→blob y la autorización server-authoritative heredada exacta de `getOrderDetail`/`getOrderEvidence`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Abrir una foto de evidencia a tamaño completo (Priority: P1)

Como técnico asignado o supervisor viendo el detalle de una orden, al pulsar una evidencia quiero que se abra un visor superpuesto que muestre **esa imagen a tamaño completo**, para poder inspeccionarla sin salir del detalle, y poder cerrarlo y volver justo donde estaba.

**Why this priority**: Es el valor central pedido («un popup… o simplemente la imagen que clicas»); sin esto la evidencia sigue sin poder verse con claridad. Es el MVP.

**Independent Test**: En una orden con ≥1 evidencia con blob disponible, pulsar el tile abre un overlay con la imagen a tamaño completo; cerrarlo devuelve el foco al tile pulsado. Verificable solo con esta historia.

**Acceptance Scenarios**:

1. **Given** una orden visible con una evidencia cuyo blob existe, **When** el usuario activa el tile (click o Enter/Espacio), **Then** se abre un visor superpuesto (`role=dialog`, `aria-modal=true`) que muestra la imagen a tamaño completo obtenida por el flujo fetch→blob existente, sin que la URL del endpoint aparezca en el DOM.
2. **Given** el visor abierto, **When** el usuario pulsa Esc, o el botón de cerrar, o hace click en el fondo (backdrop) fuera de la imagen, **Then** el visor se cierra y el foco vuelve al tile que lo abrió.
3. **Given** el visor abierto mientras la imagen aún se descarga, **When** la descarga está en curso, **Then** se muestra un indicador de carga; **When** la descarga falla con 410, **Then** se muestra el mensaje «La evidencia ya no está disponible» (heredado de 024) dentro del visor, sin imagen rota.
4. **Given** el visor abierto, **When** el usuario navega con Tab/Shift+Tab, **Then** el foco permanece atrapado entre los controles del visor (no se escapa al contenido de fondo).

---

### User Story 2 - Navegar entre varias fotos (carrusel) (Priority: P2)

Como usuario viendo el detalle de una orden con **varias** evidencias, quiero moverme entre ellas dentro del mismo visor (anterior/siguiente) con un indicador de posición, para revisarlas todas sin cerrar y reabrir.

**Why this priority**: Amplía el valor a órdenes con múltiples fotos; depende de US1 pero no la bloquea (US1 ya entrega valor con una sola imagen).

**Independent Test**: En una orden con ≥2 evidencias, abrir el visor desde el tile 2 muestra la 2ª imagen y el indicador «2 de N»; avanzar/retroceder cambia la imagen y el indicador. Verificable de forma independiente.

**Acceptance Scenarios**:

1. **Given** una orden con N≥2 evidencias con blob, **When** el usuario abre el visor desde el tile de posición k, **Then** el visor muestra la imagen k y un indicador textual «k de N».
2. **Given** el visor abierto en la posición k, **When** el usuario activa «siguiente» (control o flecha derecha) con k<N, **Then** el visor muestra la imagen k+1 y el indicador pasa a «k+1 de N»; **When** activa «anterior» (o flecha izquierda) con k>1, **Then** muestra k−1.
3. **Given** el visor en la primera (k=1) o última (k=N) evidencia, **When** el usuario intenta retroceder desde la primera o avanzar desde la última, **Then** la navegación no sobrepasa los límites (sin envolver) y los controles fuera de rango se presentan como no disponibles.
4. **Given** una orden con **una sola** evidencia, **When** se abre el visor, **Then** no se ofrecen controles de anterior/siguiente ni indicador de posición.

---

### User Story 3 - Evidencia sembrada visible en desarrollo (Priority: P3, solo dev)

Como desarrollador que ejecuta el seed en local, quiero que la evidencia sembrada tenga un **blob de imagen real** almacenado, para poder ver el visor funcionando sin tener que subir una foto manualmente en cada entorno de desarrollo.

**Why this priority**: Comodidad de desarrollo/demostración; no afecta a producción ni al contrato. Es independiente de US1/US2 (estas funcionan con cualquier evidencia que tenga blob, sembrada o subida).

**Independent Test**: Tras re-sembrar la BD de desarrollo, abrir el detalle de la orden ancla y pulsar su evidencia muestra la imagen (200), no el mensaje de 410.

**Acceptance Scenarios**:

1. **Given** una base de datos de desarrollo recién sembrada, **When** el seed crea una fila `OrderEvidence`, **Then** también almacena, a través del mismo puerto de almacenamiento cifrado que usa la subida real, un blob de imagen cuyo `object_ref` coincide **exactamente** con el de la fila.
2. **Given** esa evidencia sembrada, **When** el usuario autorizado la solicita, **Then** `getOrderEvidence` responde 200 con el binario (no 410), sirviéndola por el mismo camino que una evidencia subida.
3. **Given** el seed, **When** se ejecuta, **Then** no cambia el contrato, la lógica de negocio ni la autorización: solo añade el blob correspondiente a datos de desarrollo.

---

### Edge Cases

- **Sin evidencia**: si la orden no tiene evidencias (o el rol no puede verla, p. ej. dispatcher), no existe tile que abrir y el visor nunca se muestra.
- **Fallback legacy (sin `items[]`)**: si el backend no incluye `items[]` (evidencia sin `evidence_id`), los tiles legacy siguen siendo no interactivos y no abren el visor (no hay identificador con el que pedir el binario).
- **prefers-reduced-motion**: con la preferencia activa, las transiciones de apertura/cambio de imagen se suprimen o reducen a un cambio instantáneo.
- **Blob purgado o expirado (410) durante el carrusel**: si al navegar a otra evidencia su blob ya no está, esa posición muestra el mensaje de no disponible sin romper la navegación al resto.
- **Doble activación / reapertura**: reabrir el visor tras cerrarlo vuelve a partir del tile pulsado; no quedan visores duplicados ni fugas de object URLs (se liberan al cerrar/cambiar).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN el usuario activa (click, Enter o Espacio) un tile de evidencia con `evidence_id` en el detalle de la orden THE front SHALL abrir un visor superpuesto con `role=dialog` y `aria-modal=true` que muestra esa evidencia a tamaño completo.
- **FR-002**: WHEN el visor necesita el binario de una evidencia THE front SHALL obtenerlo mediante el flujo fetch→blob existente (`getOrderEvidence`) y renderizarlo desde un object URL, SIN incluir la URL del endpoint como atributo `src`/`href` en el DOM.
- **FR-003**: WHEN el visor está abierto y el usuario pulsa Esc, activa el control de cerrar, o hace click en el backdrop fuera de la imagen THE front SHALL cerrar el visor y devolver el foco al elemento (tile) que lo abrió.
- **FR-004**: WHILE el visor está abierto THE front SHALL mantener el foco del teclado atrapado dentro del visor (Tab/Shift+Tab ciclan solo por sus controles) y no debe ser posible interactuar por teclado con el contenido de fondo.
- **FR-005**: WHILE el binario de la evidencia mostrada se está descargando THE front SHALL mostrar un indicador de carga dentro del visor; WHEN la descarga falla THE front SHALL mostrar el mensaje de error heredado (410 → «La evidencia ya no está disponible») sin imagen rota y sin exponer detalles internos.
- **FR-006**: WHEN la orden tiene N≥2 evidencias con `evidence_id` THE front SHALL ofrecer navegación anterior/siguiente dentro del visor y un indicador textual de posición «k de N».
- **FR-007**: WHEN el usuario abre el visor desde el tile de posición k THE front SHALL mostrar inicialmente la evidencia k.
- **FR-008**: WHEN el usuario activa siguiente/anterior (control o flechas ←/→) THE front SHALL cambiar a la evidencia adyacente dentro del rango [1..N] sin envolver (no pasa de N a 1 ni de 1 a N) y actualizar el indicador.
- **FR-009**: WHEN la orden tiene exactamente 1 evidencia THE front SHALL NOT mostrar controles de navegación ni indicador de posición.
- **FR-010**: THE front SHALL estilar el visor usando exclusivamente tokens del design system (sin valores hex/px/tipografía sueltos) y textos en español (i18n), y SHALL respetar `prefers-reduced-motion` suprimiendo o reduciendo las animaciones de apertura/cambio.
- **FR-011**: THE front SHALL renderizar y operar el visor de forma usable tanto en viewport de campo (móvil) como de oficina (escritorio), sin desbordes horizontales de la imagen.
- **FR-012**: THE feature SHALL NOT modificar backend, contrato OpenAPI, RBAC ni el endpoint `getOrderEvidence`; la autorización de la evidencia permanece server-authoritative y heredada exacta de `getOrderDetail`.
- **FR-013**: WHEN el seed de desarrollo crea una fila `OrderEvidence` THE seed SHALL almacenar, a través del mismo puerto de almacenamiento cifrado que la subida real, un blob de imagen cuyo `object_ref` coincide exactamente con el de la fila, de modo que `getOrderEvidence` responda 200 (no 410) para esa evidencia.
- **FR-014**: THE cambio de seed SHALL limitarse a datos de desarrollo: no altera el contrato, la lógica de negocio, la autorización ni el comportamiento en producción.

### Key Entities *(include if feature involves data)*

- **Evidencia (vista de UI)**: elemento del detalle de orden identificado por `evidence_id` con su `content_type`; el visor opera sobre la lista ordenada de evidencias `items[]` de la orden. No introduce entidades de datos nuevas.
- **Blob de evidencia (dev seed)**: contenido binario de imagen asociado 1:1 a una fila `OrderEvidence` por su `object_ref`; en dev lo produce el seed usando el puerto de almacenamiento existente. Reutiliza el invariante «un `object_ref` ↔ una fila» de 024.

## Contrato (OpenAPI)

**No hay endpoints nuevos ni cambios de contrato.** La feature es de **presentación (frontend)** y reutiliza el endpoint existente `getOrderEvidence` (`GET /v1/orders/{orderId}/evidence/{evidenceId}`) y el campo `evidence.items[]` de `getOrderDetail`, ambos definidos por 024. El habilitador de dev (US3) solo escribe datos (blob) a través del puerto de almacenamiento ya existente; no toca `contracts/`.

## Trazabilidad (RF → endpoint → tarea → test)

| FR | Endpoint(s) | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-001 | (reutiliza) getOrderEvidence | (pend. tasks) | `should abrir el visor al activar un tile de evidencia` |
| FR-002 | getOrderEvidence | (pend. tasks) | `should renderizar la imagen desde blob sin exponer la URL del endpoint` |
| FR-003 | — | (pend. tasks) | `should cerrar con Esc/backdrop/botón y devolver foco al tile` |
| FR-004 | — | (pend. tasks) | `should atrapar el foco dentro del visor` |
| FR-005 | getOrderEvidence | (pend. tasks) | `should mostrar carga y mensaje 410 sin imagen rota` |
| FR-006 | — | (pend. tasks) | `should mostrar navegación e indicador k de N con N>=2` |
| FR-007 | — | (pend. tasks) | `should abrir en la posición del tile pulsado` |
| FR-008 | — | (pend. tasks) | `should navegar adyacente sin envolver` |
| FR-009 | — | (pend. tasks) | `should ocultar navegación con una sola evidencia` |
| FR-010 | — | (pend. tasks) | `should usar solo tokens y respetar prefers-reduced-motion` |
| FR-011 | — | (pend. tasks) | `should ser usable en viewport móvil y escritorio` |
| FR-012 | — | (pend. tasks) | `arch: sin cambios en backend/contracts/rbac` |
| FR-013 | getOrderEvidence | (pend. tasks) | `should servir 200 para la evidencia sembrada` |
| FR-014 | — | (pend. tasks) | `should limitar el cambio de seed a datos de dev` |

> Se mantiene en `docs/traceability.md` al implementar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de las evidencias con blob disponible mostradas en el detalle pueden abrirse a tamaño completo en el visor con una sola activación del tile (click o teclado).
- **SC-002**: Desde el visor, en una orden con N evidencias, el usuario puede alcanzar cualquiera de las N imágenes sin cerrar el visor (0 reaperturas necesarias).
- **SC-003**: El visor supera una auditoría automática de accesibilidad (axe) con **0 violaciones**, incluyendo foco atrapado, `role=dialog`/`aria-modal` y retorno de foco al cerrar.
- **SC-004**: Cierre del visor por los tres medios (Esc, backdrop, botón) en el 100 % de los casos, con retorno de foco verificado al tile de origen.
- **SC-005**: 0 valores de estilo fuera de tokens (hex/px/tipografía sueltos) en los componentes del visor, verificado por stylelint/eslint del proyecto.
- **SC-006**: Tras re-sembrar la BD de desarrollo, la evidencia de la orden ancla se sirve con 200 (no 410) al abrir el visor, en el 100 % de las ejecuciones del seed.

> Cada SC es medible (Constitution XIV). SC-003 y SC-005 se verifican con herramientas deterministas (axe, stylelint/eslint); el resto por tests de UI.

## Assumptions

- El detalle de orden ya emite `evidence.items[]` con `evidence_id` reales (entregado por 024); el visor solo opera sobre evidencias con `evidence_id` (los tiles legacy sin id no abren visor).
- Se reutiliza el flujo fetch→blob y los mensajes de error de 024 (401/404 uniforme, 410 «no disponible»); esta feature no redefine la semántica de esos estados.
- La autorización sigue siendo server-authoritative: el visor no decide visibilidad; muestra lo que el backend autoriza a `getOrderDetail`/`getOrderEvidence`.
- El seed usa el adaptador de almacenamiento de desarrollo (fs + crypto) ya existente; no se introduce un almacén nuevo. La imagen sembrada es un recurso de prueba embebido/local, no PII real.
- El componente base de modal/overlay del design system (si existe) se reutiliza; si no existe, se construye respetando tokens y a11y, sin librerías externas de lightbox.
- Ámbito acotado (Principio XV): no se añaden zoom, descarga, rotación, miniaturas ni gestos táctiles avanzados; solo ver a tamaño completo y navegar anterior/siguiente.
