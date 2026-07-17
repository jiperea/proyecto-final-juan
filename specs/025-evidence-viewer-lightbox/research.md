# Research — Visor ampliado de evidencia (025)

Feature de presentación (frontend). Decisiones de diseño clave, todas ancladas al código existente.

## D1 — Base del modal: reutilizar el patrón de `ConfirmDialog`

- **Decisión**: construir un componente nuevo `EvidenceViewer` que **reutiliza el patrón de `src/ui/ConfirmDialog.tsx`** (foco inicial dentro, focus-trap con Tab/Shift+Tab, Esc cierra, retorno de foco al disparador vía `restoreRef`, solo clases de token `.dialog`/`.dialog-overlay`).
- **Diferencias respecto a `ConfirmDialog`**: `role="dialog"` (no `alertdialog`); el **backdrop SÍ cierra** (FR-003; en `ConfirmDialog` no, por ser acción irreversible); contenido = imagen a tamaño completo + controles de carrusel en vez de acciones confirmar/cancelar.
- **Rationale**: consistencia a11y ya probada en el repo, sin añadir dependencias externas de lightbox/focus-trap.
- **Alternativas descartadas**: (a) librería de lightbox externa → viola «sin librerías externas» y mete estilos fuera de tokens; (b) `<dialog>` nativo → soporte/estilado inconsistente con el design system actual.

## D2 — Carga de la imagen: reutilizar `useOrderEvidence` (fetch→blob→object URL)

- **Decisión**: el visor obtiene el binario con el hook existente `useOrderEvidence(orderId, evidenceId, opened)` (TanStack Query, `apiFetchBlob('/v1/orders/:id/evidence/:evidenceId')`), crea `URL.createObjectURL(blob)` y lo pinta en `<img src={objectURL}>`. La URL del endpoint **nunca** va al DOM (FR-002).
- **Revocación** (FR-013): `URL.revokeObjectURL` al cerrar el visor y al cambiar de imagen; patrón ya usado en `EvidenceTile`/`EvidencePicker`.
- **Rationale**: reutiliza caché de Query (si el tile ya cargó, apertura inmediata) y toda la semántica de error de 024.
- **Alternativas descartadas**: fetch propio en el visor → duplicaría manejo de 401/refresh y caché.

## D3 — Estado del carrusel: índice sobre `items[]`, límites deshabilitados, reset por orden

- **Decisión**: el estado de apertura + índice actual vive en `OrderDetailView` (que ya posee `evidence.items[]`). El visor recibe `items`, `startIndex` y callbacks. Navegación ←/→ y controles anterior/siguiente cambian el índice dentro de `[0..N-1]` **sin envolver**; en los límites el control queda **visible + `disabled`/`aria-disabled`** (FR-008). Con N=1, sin controles ni indicador (FR-009).
- **Orden**: se respeta el orden de `items[]` tal cual lo entrega el backend (assumption de la spec); el indicador «k de N» usa esa posición.
- **Reset (FR-014)**: al cambiar de `orderId` en el detalle, se cierra el visor y se limpia índice + object URLs (evita pedir un binario con par order/evidence mezclado).
- **Rationale**: mínimo estado, alineado con cómo `OrderDetailView` ya mapea `items[]` a tiles.

## D4 — Manejo de errores: reutilizar `src/i18n/errors.ts` y `ApiError`

- **Decisión**: carga → spinner (`Spinner` de `ui/states`). 401 → lo gestiona `apiFetch` (refresh/logout), el visor no lo trata. 410 → `NOT_AVAILABLE_MESSAGE`. 404/red/otros ≥400 → mensaje genérico (`messageForCode`/`FALLBACK_MESSAGE`) **sin** exponer código/detalle (FR-005). Se reutiliza `ApiError.userMessage` como ya hace `EvidenceTile`.
- **Rationale**: convención de mensajes del proyecto (no hay framework i18n; hay módulo centralizado de mensajes).

## D5 — Estilado: solo tokens; contención de imagen; reduced-motion 0 ms

- **Decisión**: extender las clases `.dialog`/`.dialog-overlay` de `components.css` (o añadir `.evidence-viewer*`) con **solo tokens** (FR-010). Imagen `max-width:100%`/`max-height` contenida, sin scroll horizontal a 360/1280 px (FR-011); controles ≥44×44 px. Transiciones envueltas en `@media (prefers-reduced-motion: reduce)` → duración 0 ms (FR-010c).
- **Rationale**: «token o nada»; verificable con stylelint/eslint (SC-005) y por breakpoint.

## D6 — Testing: RTL + vitest-axe, `getOrderEvidence` mockeado

- **Decisión**: tests de componente (`EvidenceViewer.test.tsx`) montando el detalle/visor con `getOrderEvidence` **mockeado** y fixtures de `items[]` (N=1 y N≥2). Cubren: apertura por click/teclado, foco atrapado + retorno, cierre triple (Esc/backdrop/botón), navegación con límites deshabilitados, indicador «k de N», estados 410/genérico, revocación de object URLs, y **axe 0 violaciones** (SC-003). Sin backend real ni seed (coherente con el descope de US3).
- **Rationale**: determinista, rápido, sin acoplarse a la topología dev.
