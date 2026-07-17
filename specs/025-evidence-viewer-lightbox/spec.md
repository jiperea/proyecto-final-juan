# Feature Specification: Visor ampliado de evidencia (lightbox + carrusel)

**Feature Branch**: `025-evidence-viewer-lightbox`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Visor ampliado de evidencia (lightbox + carrusel) en el detalle de orden para técnico y supervisor. Al pulsar una evidencia, abrir un popup/modal a tamaño completo con la imagen real servida por getOrderEvidence, reutilizando el fetch→blob existente sin exponer la URL del endpoint en el DOM. Con varias evidencias: carrusel con anterior/siguiente e indicador «N de total». Cierre con Esc, click en backdrop y botón cerrar. Accesibilidad WCAG 2.1 AA (foco atrapado, retorno de foco, role=dialog/aria-modal, teclado, prefers-reduced-motion). Solo frontend — no toca backend/contratos/RBAC."

## Contexto

La feature **024** (evidencia binaria) dejó el detalle de orden mostrando cada evidencia como un *tile* «Ver imagen N» que, al pulsarlo, descarga el blob y pinta la imagen **dentro del tile** (pequeña, incrustada). Falta la capa de **visualización ampliada**: al pulsar no se abre nada a tamaño completo ni hay forma de navegar entre varias fotos. Esta feature añade el visor ampliado (lightbox + carrusel). **No cambia backend, contrato, RBAC ni el endpoint**: reutiliza el flujo fetch→blob y la autorización server-authoritative heredada exacta de `getOrderDetail`/`getOrderEvidence`. Es una feature **solo frontend**.

## Clarifications

### Session 2026-07-17

- Q: ¿Origen del blob de imagen del seed (habilitador dev)? → A: **Fuera de alcance (descope).** El habilitador de seed (originalmente US3) se **saca de esta feature a una spec propia**: durante G1 reveló entanglement con la topología del entorno dev (el `make seed` estándar puebla `fieldops_test`, no la `fieldops` que sirve al navegador; + directorio de almacenamiento/volúmenes). Se aísla como cluster aparte (Principio XV) para no bloquear el visor; la decisión de diseño del blob (p. ej. bytes embebidos) se resolverá en esa spec, no aquí. Para ver una imagen real en dev **hoy**: subir una foto como técnico en una orden `in_progress` (flujo de 024, ya operativo).
- Q: ¿El seed siembra varias evidencias para el carrusel? → A: Moot tras el descope. El carrusel (US2) se verifica con test de componente (fixture `items[]` N≥2), no con el seed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Abrir una foto de evidencia a tamaño completo (Priority: P1)

Como técnico asignado o supervisor viendo el detalle de una orden, al pulsar una evidencia quiero que se abra un visor superpuesto que muestre **esa imagen a tamaño completo**, para poder inspeccionarla sin salir del detalle, y poder cerrarlo y volver justo donde estaba.

**Why this priority**: Es el valor central pedido («un popup… o simplemente la imagen que clicas»); sin esto la evidencia sigue sin poder verse con claridad. Es el MVP.

**Independent Test**: Verificable con un **test de componente** que monta el detalle/visor con `getOrderEvidence` mockeado (fixture de `items[]` con ≥1 evidencia), sin backend real ni subida manual: pulsar el tile abre un overlay con la imagen a tamaño completo; cerrarlo devuelve el foco al tile pulsado.

**Acceptance Scenarios**:

1. **Given** una orden visible con una evidencia cuyo blob existe, **When** el usuario activa el tile (click o Enter/Espacio), **Then** se abre un visor superpuesto (`role=dialog`, `aria-modal=true`) que muestra la imagen a tamaño completo obtenida por el flujo fetch→blob existente, sin que la URL del endpoint aparezca en el DOM.
2. **Given** el visor abierto, **When** el usuario pulsa Esc, o el botón de cerrar, o hace click en el fondo (backdrop) fuera de la imagen, **Then** el visor se cierra y el foco vuelve al tile que lo abrió.
3. **Given** el visor abierto mientras la imagen aún se descarga, **When** la descarga está en curso, **Then** se muestra un indicador de carga; **When** la descarga falla con 410 (`EVIDENCE_GONE`), **Then** se muestra «Esta imagen ya no está disponible.» (el texto de `messageForCode('EVIDENCE_GONE')`, heredado de 024) dentro del visor, sin imagen rota.
4. **Given** el visor abierto, **When** el usuario navega con Tab/Shift+Tab, **Then** el foco permanece atrapado entre los controles del visor (no se escapa al contenido de fondo).

---

### User Story 2 - Navegar entre varias fotos (carrusel) (Priority: P2)

Como usuario viendo el detalle de una orden con **varias** evidencias, quiero moverme entre ellas dentro del mismo visor (anterior/siguiente) con un indicador de posición, para revisarlas todas sin cerrar y reabrir.

**Why this priority**: Amplía el valor a órdenes con múltiples fotos; depende de US1 pero no la bloquea (US1 ya entrega valor con una sola imagen).

**Independent Test**: Verificable con un **test de componente** que monta el detalle/visor con un fixture (mock) de `items[]` de N≥2 evidencias, sin depender del seed ni de subidas manuales contra el backend: abrir desde el tile 2 muestra la 2ª imagen y el indicador «2 de N»; avanzar/retroceder cambia imagen e indicador.

**Acceptance Scenarios**:

1. **Given** una orden con N≥2 evidencias con blob, **When** el usuario abre el visor desde el tile de posición k, **Then** el visor muestra la imagen k y un indicador textual «k de N».
2. **Given** el visor abierto en la posición k, **When** el usuario activa «siguiente» (control o flecha derecha) con k<N, **Then** el visor muestra la imagen k+1 y el indicador pasa a «k+1 de N»; **When** activa «anterior» (o flecha izquierda) con k>1, **Then** muestra k−1.
3. **Given** el visor en la primera (k=1) o última (k=N) evidencia, **When** el usuario intenta retroceder desde la primera o avanzar desde la última, **Then** la navegación no sobrepasa los límites (sin envolver) y el control fuera de rango permanece **visible pero deshabilitado con `disabled` nativo** (no tabulable ni activable), sin eliminarse del DOM.
4. **Given** una orden con **una sola** evidencia, **When** se abre el visor, **Then** no se ofrecen controles de anterior/siguiente ni indicador de posición.

---

### Edge Cases

- **Sin evidencia / rol sin acceso**: si la orden no tiene evidencias, o el rol no puede verlas (p. ej. dispatcher), no existe tile que activar y el visor nunca se muestra.
- **Tile legacy sin `evidence_id`**: un tile del fallback legacy (evidencia sin `evidence_id`) no es interactivo y **no abre el visor** (no hay identificador con el que pedir el binario) — ver FR-001.
- **Orden cerrada**: si la orden pasa a `closed`, por diseño de 024 («closed no se sirve nunca») `getOrderEvidence` devuelve 404 y el visor muestra el mensaje genérico (FR-005). Es comportamiento **correcto**, no un fallo del visor.
- **prefers-reduced-motion**: con la preferencia activa, la transición de apertura/cierre del visor pasa a 0 ms; el cambio de imagen del carrusel ya es un swap instantáneo (sin transición) — ver FR-010c.
- **Blob purgado o expirado (410) durante el carrusel**: si al navegar a otra evidencia su blob ya no está, esa posición muestra el mensaje de no disponible (FR-005) sin romper la navegación al resto.
- **Doble activación / reapertura**: reabrir el visor tras cerrarlo vuelve a partir del tile pulsado; no quedan visores duplicados ni fugas de object URLs (se revocan al cerrar/cambiar — FR-013).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN el usuario activa (click, Enter o Espacio) un tile de evidencia con `evidence_id` en el detalle de la orden THE front SHALL abrir un visor superpuesto con `role=dialog` y `aria-modal=true` que muestra esa evidencia a tamaño completo.
- **FR-002**: WHEN el visor necesita el binario de una evidencia THE front SHALL obtenerlo mediante el flujo fetch→blob existente (`getOrderEvidence`) y renderizarlo desde un object URL, SIN incluir la URL del endpoint como atributo `src`/`href` en el DOM.
- **FR-003**: WHEN el visor está abierto y el usuario pulsa Esc, activa el control de cerrar, o hace click en el backdrop fuera de la imagen THE front SHALL cerrar el visor y devolver el foco al elemento (tile) que lo abrió.
- **FR-004**: WHILE el visor está abierto THE front SHALL mantener el foco del teclado atrapado dentro del visor (Tab/Shift+Tab ciclan solo por sus controles) y no debe ser posible interactuar por teclado con el contenido de fondo.
- **FR-005**: WHILE el binario de la evidencia mostrada se está descargando THE front SHALL mostrar un indicador de carga dentro del visor. WHEN `getOrderEvidence` responde 401 THE front SHALL delegar en el manejo de sesión existente del cliente HTTP (refresh/logout ya implementado en `apiFetch`), sin tratarlo como error del visor. WHEN responde **410 `EVIDENCE_GONE`** THE front SHALL mostrar `messageForCode('EVIDENCE_GONE')` (= «Esta imagen ya no está disponible.», el mismo texto que ya usa `EvidenceTile`). WHEN falla la **red/offline** THE front SHALL mostrar `OFFLINE_MESSAGE` (= «Sin conexión. Reinténtalo.»). WHEN responde **404 o cualquier otro estado ≥400 distinto de 401/410** THE front SHALL mostrar **`FALLBACK_MESSAGE`** (= «Ha ocurrido un error. Reinténtalo.»), un **único** texto fijo para todos esos casos —**NO** el texto por-código de `messageForCode` para 404/403/etc.— preservando el «404 uniforme» de 024 (el visor no revela el motivo/código de la denegación), sin imagen rota. El estado de carga/error es **por evidencia (por índice)**, no compartido entre posiciones del carrusel. WHEN la descarga resuelve 200 pero el binario **no es decodificable** como imagen (evento `onerror` del `<img>`) THE front SHALL mostrar `FALLBACK_MESSAGE` en lugar de una imagen rota, **revocar de inmediato el object URL** de ese blob (no esperar al cierre/cambio) y **no registrar** en consola/telemetría la URL blob, el `evidence_id` ni el detalle del error (solo el mensaje genérico en UI).
- **FR-006**: WHEN la orden tiene N≥2 evidencias con `evidence_id` THE front SHALL ofrecer navegación anterior/siguiente dentro del visor y un indicador textual de posición «k de N».
- **FR-007**: WHEN el usuario abre el visor desde el tile de posición k THE front SHALL mostrar inicialmente la evidencia k.
- **FR-008**: WHEN el usuario activa siguiente/anterior (control o flechas ←/→) THE front SHALL cambiar a la evidencia adyacente dentro del rango [1..N] sin envolver (no pasa de N a 1 ni de 1 a N) y actualizar el indicador. WHEN la posición actual es el límite (k=1 para «anterior», k=N para «siguiente») THE front SHALL mantener el control correspondiente **visible pero deshabilitado con el atributo nativo `disabled`** (no solo `aria-disabled`), sin eliminarlo del DOM: así el focus-trap reutilizado (selector `button:not([disabled])`) lo **excluye del ciclo de Tab** y no es activable por click/Enter. WHEN el usuario navega rápido (varias pulsaciones antes de resolver una descarga) THE front SHALL garantizar que **solo la respuesta correspondiente al índice vigente** actualiza la imagen (una respuesta tardía de una posición abandonada no sobrescribe la actual).
- **FR-009**: WHEN la orden tiene exactamente 1 evidencia THE front SHALL NOT mostrar controles de navegación ni indicador de posición.
- **FR-010**: THE front SHALL estilar el visor usando exclusivamente tokens del design system, sin valores hex, px ni familia/tamaño de tipografía sueltos en sus componentes (verificable por stylelint/eslint del proyecto, 0 hallazgos).
- **FR-010b**: THE front SHALL presentar todos los textos del visor en español, coherente con la convención del proyecto: los **mensajes de error/estado** reutilizan el módulo centralizado `src/i18n/errors.ts` — `messageForCode('EVIDENCE_GONE')` para el 410, `OFFLINE_MESSAGE` para red, `FALLBACK_MESSAGE` para el resto (ver FR-005); **sin inventar strings nuevos**. Las **etiquetas de control** (cerrar, anterior/siguiente, indicador «k de N») son literales en español como el resto del design system (p. ej. `ConfirmDialog`: «Confirmar»/«Cancelar»). No se introduce un framework i18n nuevo.
- **FR-010c**: La **única** transición animada del visor es su **apertura/cierre** (sobre la clase del overlay/diálogo, p. ej. `.evidence-viewer`/`.evidence-viewer__overlay`); el **cambio de imagen del carrusel es un swap instantáneo sin transición CSS** (no hay nada que animar ahí). THE front SHALL envolver esa transición de apertura/cierre en una regla `@media (prefers-reduced-motion: reduce)` que fija su duración a **0 ms** (mecanismo **CSS puro**, sin lectura JS de `matchMedia`). Verificable de forma estática: la regla existe en `components.css` y aplica a la clase nombrada del visor (consistente con `reduced-motion.test.ts`).
- **FR-011**: THE front SHALL renderizar y operar el visor sin scroll horizontal del contenido en anchos de viewport de **360 px** (campo/móvil) y **1280 px** (oficina/escritorio), con la imagen contenida (`max-width:100%`) y controles interactivos con área táctil de **≥44×44 px**.
- **FR-012**: THE feature SHALL NOT modificar backend, contrato OpenAPI, RBAC, el endpoint `getOrderEvidence` ni el seed; la autorización de la evidencia permanece server-authoritative y heredada exacta de `getOrderDetail`.
- **FR-013**: WHEN el visor se cierra o cambia la imagen mostrada (carrusel) THE front SHALL revocar (`URL.revokeObjectURL`) los object URLs que dejan de estar en uso, de modo que no se acumulen referencias de blob en memoria.
- **FR-014**: THE front SHALL garantizar que el estado del visor (índice, lista de evidencias, object URLs) **no se arrastra entre órdenes distintas**, de forma que nunca se solicite un binario con un par `orderId`/`evidence_id` mezclado. Esto se apoya en el invariante de arquitectura existente: `OrdersView` monta `<OrderDetailView key={orderId} …>`, por lo que **cambiar de orden remonta todo el detalle** (incluido el visor y su estado), que nace limpio para la nueva orden. El requisito verificable de esta feature es: WHEN el `EvidenceViewer` **se desmonta** (por cambio de orden vía remount, o por cierre) THE front SHALL **revocar los object URLs** que tuviera vivos (efecto de limpieza), sin fugas. Este invariante (el `key={orderId}`) queda **protegido por un test de gobernanza** (T003), de modo que un refactor futuro que lo elimine falle. *(La gestión del foco al navegar entre órdenes es comportamiento preexistente de la SPA, no introducido ni alterado por esta feature.)*

### Key Entities *(include if feature involves data)*

- **Evidencia (vista de UI)**: elemento del detalle de orden identificado por `evidence_id` con su `content_type`; el visor opera sobre la lista ordenada de evidencias `items[]` de la orden. **No introduce entidades de datos nuevas ni persiste nada** (feature solo de presentación).

## Contrato (OpenAPI)

**No hay endpoints nuevos ni cambios de contrato.** La feature es de **presentación (frontend)** y reutiliza el endpoint existente `getOrderEvidence` (`GET /v1/orders/{orderId}/evidence/{evidenceId}`) y el campo `evidence.items[]` de `getOrderDetail`, ambos definidos por 024. No toca `contracts/`, backend, RBAC ni el seed.

## Trazabilidad (RF → endpoint → tarea → test)

| FR | Endpoint(s) | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-001 | (reutiliza) getOrderEvidence | T004 (Red), T006, T007 | `should abrir el visor al activar un tile de evidencia` |
| FR-002 | getOrderEvidence | T008, T010 | `should renderizar la imagen desde blob sin exponer la URL del endpoint` |
| FR-003 | — | T007, T009 | `should cerrar con Esc/backdrop/botón y devolver foco al tile` |
| FR-004 | — | T007, T009 | `should atrapar el foco dentro del visor` |
| FR-005 | getOrderEvidence | T008, T010 | `should mostrar 410 (EVIDENCE_GONE), OFFLINE, FALLBACK único (404/otros) y onError de img sin fuga` |
| FR-006 | — | T012, T013 | `should mostrar navegación e indicador k de N con N>=2` |
| FR-007 | — | T012, T013 | `should abrir en la posición del tile pulsado` |
| FR-008 | — | T012, T013 | `should navegar sin envolver, límites con disabled nativo, y sin cruces en navegación rápida` |
| FR-009 | — | T012, T013 | `should ocultar navegación con una sola evidencia` |
| FR-010 | — | T001, T003 | `governance: 0 hex/px/tipografía sueltos en el visor` |
| FR-010b | — | T007, T008, T012 | `should usar EVIDENCE_GONE/OFFLINE/FALLBACK de errors.ts y etiquetas es en controles (incl. carrusel)` |
| FR-010c | — | T001, T015 | `should tener regla @media prefers-reduced-motion:reduce a 0ms en el visor (CSS estático)` |
| FR-011 | — | T001, T016 | `should no tener scroll horizontal a 360px y 1280px; controles >=44px` |
| FR-012 | — | T003 | `governance: sin cambios en backend/contracts/rbac/seed; OrdersView mantiene key={orderId}` |
| FR-013 | — | T008, T010, T014 | `should revocar object URLs al cerrar y al cambiar de imagen` |
| FR-014 | — | T004, T005 | `should no arrastrar estado entre órdenes (remount) y revocar object URLs al desmontar` |
| (edge legacy) | — | T004, T006 | `should no abrir el visor en un tile sin evidence_id` |
| (edge 410 por-índice / carrera) | — | T012, T013 | `should aislar 410 por índice y no cruzar imágenes en navegación rápida` |
| (edge reapertura) | — | T007, T009 | `should no duplicar overlay al abrir→cerrar→reabrir` |

> Se mantiene en `docs/traceability.md` al implementar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de las evidencias con blob disponible mostradas en el detalle pueden abrirse a tamaño completo en el visor con una sola activación del tile (click o teclado).
- **SC-002**: Desde el visor, en una orden con N evidencias, el usuario puede alcanzar cualquiera de las N imágenes sin cerrar el visor (0 reaperturas necesarias).
- **SC-003**: El visor supera una auditoría automática de accesibilidad (axe) con **0 violaciones**, incluyendo foco atrapado, `role=dialog`/`aria-modal` y retorno de foco al cerrar.
- **SC-004**: Cierre del visor por los tres medios (Esc, backdrop, botón) en el 100 % de los casos, con retorno de foco verificado al tile de origen.
- **SC-005**: 0 valores de estilo fuera de tokens (hex/px/tipografía sueltos) en los componentes del visor, verificado por stylelint/eslint del proyecto.

> Cada SC es medible (Constitution XIV). SC-003 y SC-005 se verifican con herramientas deterministas (axe, stylelint/eslint); el resto por tests de UI.

## Assumptions

- El detalle de orden ya emite `evidence.items[]` con `evidence_id` reales (entregado por 024); el visor solo opera sobre evidencias con `evidence_id` (los tiles legacy sin id no abren visor). Se asume que el detalle **renderiza los tiles en el mismo orden que `items[]`**, sin reordenar ni filtrar, de modo que la posición k del tile ≡ índice k del array (base del indicador «k de N»).
- Se reutiliza el flujo fetch→blob de 024. El manejo de **401 lo realiza el cliente HTTP existente** (`apiFetch`: refresh/logout), no el visor; el visor solo pinta estados 410/404/red (FR-005). Esta feature no redefine la semántica de esos estados en el backend.
- La autorización sigue siendo server-authoritative: el visor no decide visibilidad; muestra lo que el backend autoriza a `getOrderDetail`/`getOrderEvidence`.
- El componente base de modal/overlay del design system (si existe) se reutiliza; si no existe, se construye respetando tokens y a11y, sin librerías externas de lightbox.
- **Para ver una imagen real en dev** se sube una foto como técnico (flujo de 024). El habilitador de seed con blob (evidencia sembrada visible sin subir) se trata en una **spec propia** (descope de G1; ver Clarifications), por su entanglement con la topología del entorno dev (BD navegada vs `db-test`, storage dir/volúmenes).
- Ámbito acotado (Principio XV): no se añaden zoom, descarga, rotación, miniaturas ni gestos táctiles avanzados; solo ver a tamaño completo y navegar anterior/siguiente.
