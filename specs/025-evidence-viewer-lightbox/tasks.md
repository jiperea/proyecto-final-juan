# Tasks: Visor ampliado de evidencia (lightbox + carrusel)

**Feature**: `025-evidence-viewer-lightbox` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Feature **solo frontend** (presentación). TDD: los tests de cada historia se escriben en **rojo** antes de implementar. Todos los tests usan `getOrderEvidence` **mockeado** (fixture de `items[]`), sin backend real ni seed. Ubicación de tests: `frontend/tests/unit/`.

## Phase 1: Setup

- [ ] T001 [P] Añadir las clases de token del visor (`.evidence-viewer`/overlay/imagen contenida `max-width:100%`/controles con área táctil ≥44×44 px) y el bloque `@media (prefers-reduced-motion: reduce)` con duración 0 ms en `frontend/src/ui/components.css`, usando **solo tokens** (FR-010, FR-010c, FR-011).
- [ ] T002 [P] Crear fixtures de `items[]` (N=1 y N≥2 con `evidence_id`/`content_type`) y un helper de mock de `useOrderEvidence`/`apiFetchBlob` reutilizable en `frontend/tests/unit/` (base de los tests de US1/US2).

## Phase 2: Foundational (bloqueante para US1 y US2)

- [ ] T003 Añadir el estado del visor `{ open, index }` en `frontend/src/features/orders/OrderDetailView.tsx`, pasar `items`+`startIndex` al visor, y **reiniciarlo al cambiar `orderId`** (FR-014).
- [ ] T004 Convertir el tile de evidencia en disparador activable (elemento `button`, click + Enter/Espacio) que abre el visor en su posición `k` en `frontend/src/features/orders/EvidenceTile.tsx`; un tile legacy **sin `evidence_id` no dispara** el visor (FR-001 lado disparador; edge legacy).

## Phase 3: User Story 1 — Abrir una foto a tamaño completo (P1) 🎯 MVP

**Goal**: al activar un tile se abre un visor `role=dialog` con la imagen a tamaño completo; se cierra por Esc/backdrop/botón devolviendo el foco; estados de carga/error correctos.

**Independent Test**: test de componente (`getOrderEvidence` mockeado) que abre el visor, verifica foco atrapado + retorno, cierre triple, render desde blob sin URL en DOM y estados 410/genérico; axe 0 violaciones.

- [ ] T005 [P] [US1] Test **Red** del shell accesible en `frontend/tests/unit/evidence-viewer.test.tsx`: abre con `role=dialog`/`aria-modal=true`; foco inicial dentro y **atrapado** (Tab/Shift+Tab); cierre con Esc, botón cerrar y click en backdrop con **retorno de foco** al tile; **axe 0 violaciones** (FR-001/FR-003/FR-004, SC-003/SC-004).
- [ ] T006 [P] [US1] Test **Red** de carga/errores en `frontend/tests/unit/evidence-viewer.test.tsx`: spinner durante la descarga; **410** → «La evidencia ya no está disponible»; **404/red/otros** → mensaje genérico **sin** código/detalle; imagen renderizada desde object URL **sin** la URL del endpoint en el DOM; `revokeObjectURL` llamado al cerrar (FR-002/FR-005/FR-013).
- [ ] T007 [US1] Crear `frontend/src/features/orders/EvidenceViewer.tsx`: modal `role=dialog`/`aria-modal`, focus-trap + Esc + retorno de foco reutilizando el patrón de `frontend/src/ui/ConfirmDialog.tsx`, **backdrop cierra** (a diferencia de ConfirmDialog), solo clases de token (FR-001/FR-003/FR-004).
- [ ] T008 [US1] Integrar en `EvidenceViewer.tsx` la carga fetch→blob con `useOrderEvidence`, render `<img>` desde `URL.createObjectURL` **sin** exponer la URL del endpoint, spinner y estados de error reutilizando `ApiError.userMessage`/`src/i18n/errors.ts`, y revocación de object URL al cerrar (FR-002/FR-005/FR-013).
- [ ] T009 [US1] Sustituir en `frontend/src/features/orders/EvidenceTile.tsx`/`OrderDetailView.tsx` el render de imagen **incrustada** por la apertura del `EvidenceViewer`, dejando el tile como disparador (limpia el `<img>` inline previo de 024).

**Checkpoint US1**: el visor abre/cierra una imagen a tamaño completo con a11y correcta — MVP entregable.

## Phase 4: User Story 2 — Navegar entre varias fotos (carrusel) (P2)

**Goal**: con N≥2 evidencias, navegar anterior/siguiente dentro del visor con indicador «k de N», sin envolver y con límites deshabilitados; con N=1, sin controles.

**Independent Test**: test de componente con fixture `items[]` N≥2: abre en k, indicador «k de N», flechas/controles cambian imagen, límites deshabilitados; N=1 sin controles.

- [ ] T010 [P] [US2] Test **Red** del carrusel en `frontend/tests/unit/evidence-viewer-carousel.test.tsx`: indicador «k de N»; abre en la posición del tile pulsado; nav ←/→ y controles anterior/siguiente; en k=1/k=N el control queda **visible + `aria-disabled`** sin envolver; con N=1 **sin** controles ni indicador (FR-006/FR-007/FR-008/FR-009, SC-002).
- [ ] T011 [US2] Añadir a `EvidenceViewer.tsx` la navegación anterior/siguiente (controles + flechas ←/→) e indicador «k de N» operando sobre `items[]`; controles deshabilitados en los límites (sin envolver); ocultos con N=1 (FR-006/FR-007/FR-008/FR-009).
- [ ] T012 [US2] Al cambiar de imagen en el carrusel, revocar el object URL saliente antes de cargar el siguiente (FR-013 durante la navegación).

**Checkpoint US2**: carrusel completo sobre US1.

## Phase 5: Polish & Cross-Cutting

- [ ] T013 [P] Verificar (test o assertion) que el visor no produce scroll horizontal a 360 px y 1280 px y que los controles miden ≥44×44 px (FR-011).
- [ ] T014 [P] Extender `frontend/tests/front-governance.test.ts` (o equivalente) para afirmar **0 estilos sueltos** (hex/px/tipografía) en los componentes del visor y que la feature **no toca backend/contracts/rbac/seed** (FR-010/FR-012, SC-005).
- [ ] T015 [P] Actualizar `docs/traceability.md` con FR-001..FR-014 → tarea → test (incl. edge «tile legacy no abre visor»).
- [ ] T016 Ejecutar `tsc` + `eslint` + `stylelint` + `vitest` y dejar todo en verde; validar el flujo de `quickstart.md`.

## Dependencies

- **Setup (T001–T002)** → antes de todo.
- **Foundational (T003–T004)** → bloquea US1 y US2.
- **US1 (T005–T009)**: T005/T006 (Red) antes de T007–T009. MVP.
- **US2 (T010–T012)**: depende de US1 (el visor existe); T010 (Red) antes de T011–T012.
- **Polish (T013–T016)**: tras US1+US2.

## Parallel Opportunities

- T001 ∥ T002 (ficheros distintos).
- Dentro de US1: T005 ∥ T006 (mismo fichero de test pero bloques independientes; escribir juntos en rojo).
- Polish: T013 ∥ T014 ∥ T015.

## Implementation Strategy

- **MVP = US1** (abrir/cerrar una imagen a tamaño completo con a11y): entrega ya el valor pedido («la imagen que clicas»).
- **Incremento = US2** (carrusel) sobre el visor de US1.
- TDD estricto: commit de test en rojo (T005/T006, T010) antes de la implementación de cada historia.
