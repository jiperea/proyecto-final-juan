# Tasks: Visor ampliado de evidencia (lightbox + carrusel)

**Feature**: `025-evidence-viewer-lightbox` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Feature **solo frontend** (presentación). **TDD estricto fase Red**: en cada fase, los tests se escriben y commitean **en rojo antes** de la implementación que los pone en verde (Constitution VI/VII). Todos los tests usan `getOrderEvidence`/`apiFetchBlob` **mockeados** (fixtures de `items[]`), sin backend real ni seed. Tests en `frontend/tests/unit/`. Strings de error tomados de `src/i18n/errors.ts` (verificados).

## Phase 1: Setup

- [X] T001 [P] Añadir clases de token del visor (`.evidence-viewer`/overlay/imagen `max-width:100%` contenida/controles ≥44×44 px) en `frontend/src/ui/components.css`, **solo tokens** (FR-010/FR-011). La **única** transición animada es la apertura/cierre del overlay (clase nombrada, p. ej. `.evidence-viewer__overlay`); el cambio de imagen es swap instantáneo. Añadir el bloque `@media (prefers-reduced-motion: reduce)` que fija esa transición a 0 ms (FR-010c).
- [X] T002 [P] Crear fixtures de `items[]` (N=1 y N≥2, con `evidence_id`/`content_type`) y helper de mock de `useOrderEvidence`/`apiFetchBlob` (con casos 200/410/404/red) reutilizable, en `frontend/tests/unit/`.
- [X] T003 [P] **Guardarraíl (Red)**: extender `frontend/tests/front-governance.test.ts` para afirmar que 025 **no toca** `backend/`/`contracts/`/RBAC/`seed` (FR-012), **0 estilos sueltos** (hex/px/tipografía) en los componentes del visor (FR-010, SC-005), y que `OrdersView.tsx` **mantiene `key={orderId}`** en `<OrderDetailView>` (invariante del que depende FR-014; falla si un refactor futuro lo quita). Se adelanta a Setup como guardarraíl durante todo el desarrollo (G2/S-002, H-003).

## Phase 2: Foundational (bloqueante) — Red → Green

- [X] T004 **Test Red** en `frontend/tests/unit/evidence-viewer.test.tsx`: (a) un tile **con** `evidence_id` es activable (button; click y Enter/Espacio) y abre el visor en su posición; (b) un tile **legacy sin** `evidence_id` **no** abre el visor (edge legacy); (c) al cambiar de `orderId` el visor no arrastra estado: el test **replica el remount** montando el detalle dentro de un wrapper con `key={orderId}` (igual que `OrdersView`) —no un `rerender` con prop cambiada, que no desmontaría—, y verifica que el nuevo detalle **no muestra el visor con evidencia previa**, **no dispara** fetch con el par antiguo, y que al desmontar el visor **se revocan sus object URLs** (FR-001 disparador, edge legacy, **FR-014**).
- [X] T005 Implementar el estado del visor `{ open, index }` en `frontend/src/features/orders/OrderDetailView.tsx` y pasar `items`+`startIndex`. El reset entre órdenes lo garantiza el remount existente (`key={orderId}` en `OrdersView`), por lo que **no** se añade lógica de reset manual; el `EvidenceViewer` incluye un **efecto de limpieza que revoca sus object URLs al desmontar** (FR-014) — pone en verde T004(c).
- [X] T006 Convertir el tile en disparador activable (button, click/Enter/Espacio) en `frontend/src/features/orders/EvidenceTile.tsx`; el tile legacy sin `evidence_id` no dispara — pone en verde T004(a,b).

## Phase 3: User Story 1 — Abrir una foto a tamaño completo (P1) 🎯 MVP

**Goal**: al activar un tile se abre un visor `role=dialog` con la imagen a tamaño completo; cierre por Esc/backdrop/botón con retorno de foco; carga/errores correctos.

**Independent Test**: test de componente (`getOrderEvidence` mockeado) que abre el visor, verifica foco atrapado + retorno, cierre triple, render desde blob sin URL en DOM y estados 410/offline/genérico; axe 0 violaciones.

- [X] T007 [P] [US1] **Test Red** (shell a11y) en `frontend/tests/unit/evidence-viewer.test.tsx`: abre `role=dialog`/`aria-modal=true`; foco inicial dentro y **atrapado**; cierre con **Esc**, **botón cerrar** y **click en backdrop** con **retorno de foco** al tile; **etiquetas de control en español** (p. ej. `aria-label`/texto «Cerrar»); **axe 0 violaciones**; reapertura (abrir→cerrar→reabrir) no deja overlay duplicado (FR-001/FR-003/FR-004/FR-010b, SC-003/SC-004; edge reapertura).
- [X] T008 [P] [US1] **Test Red** (carga/errores) en el mismo fichero: spinner durante la descarga; **410**→«Esta imagen ya no está disponible.» (`messageForCode('EVIDENCE_GONE')`); **red**→`OFFLINE_MESSAGE`; **404 y otros ≥400**→`FALLBACK_MESSAGE` (mismo texto para todos, **no** por-código); **200 con blob no decodificable** (`onerror` del `<img>`)→`FALLBACK_MESSAGE` (sin imagen rota), **revocando de inmediato** el object URL de ese blob y **sin loguear** URL blob/`evidence_id`/detalle del error; imagen desde object URL **sin** la URL del endpoint en el DOM; `revokeObjectURL` al cerrar (FR-002/FR-005/FR-013).
- [X] T009 [US1] Crear `frontend/src/features/orders/EvidenceViewer.tsx`: modal `role=dialog`/`aria-modal`, focus-trap + Esc + retorno de foco reutilizando el patrón de `frontend/src/ui/ConfirmDialog.tsx`, **backdrop cierra** (a diferencia de ConfirmDialog), etiquetas es, solo tokens — verde de T007.
- [X] T010 [US1] Integrar en `EvidenceViewer.tsx` la carga fetch→blob con `useOrderEvidence`, render `<img>` desde `URL.createObjectURL` sin URL de endpoint, spinner, y **colapso de errores** (410→`messageForCode('EVIDENCE_GONE')`; red→`OFFLINE_MESSAGE`; resto→`FALLBACK_MESSAGE` único; `onError` del `<img>`→`FALLBACK_MESSAGE` con revocación inmediata del object URL y sin logging del detalle), revocación al cerrar — verde de T008.
- [X] T011 [US1] Sustituir en `EvidenceTile.tsx`/`OrderDetailView.tsx` el render de imagen **incrustada** (de 024) por la apertura del `EvidenceViewer`.

**Checkpoint US1**: abrir/cerrar una imagen a tamaño completo con a11y correcta — MVP.

## Phase 4: User Story 2 — Navegar entre varias fotos (carrusel) (P2) — Red → Green

**Goal**: con N≥2, navegar anterior/siguiente con indicador «k de N», sin envolver, límites con `disabled` nativo; con N=1, sin controles.

**Independent Test**: test de componente con fixture `items[]` N≥2: abre en k, indicador «k de N», nav cambia imagen, límites deshabilitados (no tabulables), N=1 sin controles; 410 por-índice y navegación rápida sin cruces.

- [X] T012 [P] [US2] **Test Red** (carrusel) en `frontend/tests/unit/evidence-viewer-carrusel.test.tsx`: indicador «k de N»; abre en la posición del tile; nav ←/→ y controles anterior/siguiente con etiquetas es; en k=1/k=N el control queda **`disabled` nativo** (no tabulable ni activable) sin envolver; N=1 **sin** controles; **410 por-índice** (navegar a una posición 410 y volver: el mensaje sale solo ahí, el resto sigue navegable); **navegación rápida** (varias pulsaciones: una respuesta tardía de posición abandonada **no** sobrescribe la vigente) (FR-006/FR-007/FR-008/FR-009, SC-002).
- [X] T013 [US2] Añadir a `EvidenceViewer.tsx` navegación anterior/siguiente (controles + flechas ←/→) e indicador «k de N» sobre `items[]`; límites con `disabled` nativo (sin envolver); ocultos con N=1; estado de carga/error **por índice**; descartar respuesta de índice no vigente (guard de carrera) — verde de T012.
- [X] T014 [US2] Al cambiar de imagen, revocar el object URL saliente antes de cargar el siguiente (FR-013 durante navegación).

**Checkpoint US2**: carrusel completo sobre US1.

## Phase 5: Polish & Cross-Cutting

- [X] T015 [P] **Test** reduced-motion (estático, CSS puro) en `frontend/tests/unit/reduced-motion.test.ts` (o equivalente): (a) `components.css` contiene la regla `@media (prefers-reduced-motion: reduce)` que fija a **0 ms** la transición de apertura/cierre del overlay (clase de T001); (b) el selector de la **imagen del carrusel no declara** `transition`/`animation` (swap instantáneo); (c) `EvidenceViewer.tsx` **no invoca `matchMedia`** (mecanismo CSS puro) (FR-010c, T-001/K-101 de G2).
- [X] T016 [P] Verificar (test/assertion) sin scroll horizontal a 360 px y 1280 px y controles ≥44×44 px (FR-011).
- [X] T017 [P] Actualizar `docs/traceability.md` (FR-001..FR-014 → tarea → test) y añadir «visor de evidencia»/«carrusel»/«lightbox» a `docs/09-glossary.md` (K-005 de G2).
- [X] T018 Ejecutar `tsc` + `eslint` + `stylelint` + `vitest` en verde; validar el flujo de `quickstart.md`.

## Dependencies

- **Setup (T001–T003)** → antes de todo; T003 es guardarraíl activo durante el desarrollo.
- **Foundational (T004→T005/T006)**: T004 (Red) antes de T005/T006 (impl). Bloquea US1/US2.
- **US1 (T007/T008 Red → T009/T010/T011)**: MVP.
- **US2 (T012 Red → T013/T014)**: depende de US1.
- **Polish (T015–T018)**: tras US1+US2.

## Parallel Opportunities

- T001 ∥ T002 ∥ T003.
- US1: T007 ∥ T008 (bloques de test independientes, escribir juntos en rojo).
- Polish: T015 ∥ T016 ∥ T017.

## Implementation Strategy

- **MVP = US1** (abrir/cerrar una imagen a tamaño completo con a11y): entrega el valor pedido.
- **Incremento = US2** (carrusel).
- **TDD Red-primero en TODAS las fases** (incl. Foundational T004): commit de test en rojo antes de cada implementación. Sin implementación de producción sin un test que la exija primero.
