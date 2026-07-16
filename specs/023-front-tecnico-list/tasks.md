# Tasks: Fidelidad lista del técnico + detalle (FE-9 · 023)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · Presentación (**solo `frontend/`**), sin endpoints/IA/backend/contratos.

> Proporcionalidad (XV): 2 pantallas, cambio en `features/orders/` + `orders.css`, reutilizando tokens de FE-8.
> **0 backend/contratos/RBAC.** **TDD**: fase Red (test que falla) antes de implementar el comportamiento nuevo.

## Phase 1: Setup

- [X] T001 Verificar `make dev` (HMR) sirve el front en `:5173`; confirmar que los tokens/componentes de FE-8 (StatusBadge, Stepper, chip, `--font-mono`) están disponibles para reutilizar.

## Phase 2: US1 — Tarjeta de la lista del técnico (P1) 🎯 MVP

**Objetivo**: tarjeta del artifact (código mono + chip, nombre, fila de meta cliente «—»/técnico condicional).
**Test independiente**: login `technician@fieldops.test` móvil ≤390px; tarjeta = pantalla 02 del artifact; técnico «Tú».

- [X] T002 [P] [US1] **[Red]** `frontend/tests/unit/order-card-meta.test.tsx`: la tarjeta muestra fila superior (código mono + chip), nombre, y **fila de meta** con cliente «—» y técnico; helper `resolveAssignee(assigned_to, sessionUserId)` → «Tú» (coincide), UUID truncado 8 chars (distinto), **«Sin asignar»** (null **o** sessionUserId indefinido/loading). Falla hasta T003/T004 (FR-001/002/003).
- [X] T003 [US1] Crear helper puro `frontend/src/features/orders/resolveAssignee.ts`: `(assigned_to: string|null, sessionUserId: string|undefined) => 'Tú' | string(uuid8) | 'Sin asignar'` (userId indefinido → «Sin asignar»). Verde parte de T002.
- [X] T004 [US1] En `frontend/src/features/orders/OrderList.tsx` (`OrderItem`) + `orders.css`: maquetar la tarjeta del artifact — fila superior (`--font-mono` código + `StatusBadge`), nombre, **fila de meta** (cliente «—»; técnico vía `resolveAssignee` con `useSession().user?.userId`); sin scroll horizontal ≤390px. `OrderItem` es **compartido** con la fila de oficina (`order-item--row`, FE-8) → la regla de meta aplica también ahí (K-004: incluir en T002 un caso de fila de oficina con `assigned_to` ≠ usuario → UUID). Verde T002 (FR-001/002/003).

## Phase 3: US2 — Cabecera del detalle (P1) 🎯 MVP

**Objetivo**: cabecera con código mono + nombre (sin sub-línea; contrato sin cliente/ubicación).
**Test independiente**: abrir detalle como técnico y supervisor; cabecera = código mono + nombre del artifact.

- [X] T005 [P] [US2] **[Red]** `frontend/tests/unit/order-detail-header.test.tsx`: el detalle muestra una **cabecera** con **código monoespaciado** + **nombre**; **no** hay sub-línea de contexto (sin cliente/ubicación). Falla hasta T006 (FR-004).
- [X] T006 [US2] En `frontend/src/features/orders/OrderDetailView.tsx` + `orders.css`: reemplazar el `h2` plano por la **cabecera** del artifact (código `--font-mono` + nombre), sin sub-línea. No cambia la visibilidad de acciones por rol. Verde T005 (FR-004).

## Phase 4: US3 — Notas y evidencia del detalle (P2)

**Objetivo**: notas en tarjeta etiquetada; evidencia en tiles «Imagen N» (o «sin evidencia»).
**Test independiente**: detalle con notas y evidencia; notas en tarjeta, tiles 4/3 = pantalla 03 del artifact.

- [X] T007 [P] [US3] **[Red]** `frontend/tests/unit/order-detail-notes.test.tsx`: `notes` con contenido → **tarjeta** «Notas del técnico» (section con surface+border+`--radius-md`+`--shadow-1`), texto escapado; `notes` ausente/vacío/solo-espacios → **no** tarjeta. Falla hasta T008 (FR-005).
- [X] T008 [US3] En `frontend/src/features/orders/OrderDetailView.tsx` + `orders.css`: notas en tarjeta etiquetada (tokens), solo si `notes?.trim()`. Verde T007 (FR-005).
- [X] T009 [P] [US3] **[Red]** `frontend/tests/unit/order-detail-evidence.test.tsx`: `evidence.count` = N>0 → **N tiles** 4/3 (`--radius-sm`) etiquetados **«Imagen N»** 1-based; `count` = 0 → estado **«sin evidencia»** y 0 tiles. Falla hasta T010 (FR-006).
- [X] T010 [US3] En `frontend/src/features/orders/OrderDetailView.tsx` (sección de evidencia del **detalle**, NO `EvidencePicker` —ese es la pantalla de registrar ejecución, fuera de alcance—) + `orders.css`: rejilla de tiles «Imagen N» por `count` (1-based) con relación 4/3; «sin evidencia» si 0. Verde T009 (FR-006).

## Phase 5: Polish, verificación y evidencia

- [X] T011 [US1] Confirmar disciplina «token o nada»: 0 hex/px/font sueltos (stylelint verde); reutiliza tokens de FE-8 (FR-008/SC-005).
- [X] T012 Correr los gates del front en verde: `cd frontend && npm run lint`, `tsc -b --noEmit`, `stylelint`, `build`, `vitest` (incl. axe). **0 regresiones**; `rbac-reskin-regression` verde; los **tests de tema/responsive existentes** (theme-toggle, master-detail-resize, etc.) siguen verdes → ancla determinista de la no-regresión de tema/viewport (FR-007/FR-008/SC-004).
- [ ] T013 **Capturas Playwright MCP** (con login del seed) de la lista del técnico (móvil) y del detalle (técnico y supervisor) en **claro y oscuro**, para la **aprobación humana de fidelidad** (rúbrica SC-001/002). *(Requiere credencial del seed → pedir al usuario.)*
- [X] T014 Actualizar `docs/traceability.md` (fila **FE-9**: FR→componente→test) — tarea de trazabilidad/proceso (Constitution VI), no de FR-008.
- [X] T015 **Verificación de alcance sobre el DIFF FINAL** (última): producción solo en `frontend/src/features/orders/**` (+ `orders.css`); import de solo-lectura de `features/auth/session` permitido; docs = `docs/traceability.md`; **0** backend/contracts/domain; **0** RBAC (FR-007/FR-010/SC-006).

## Dependencias

- Setup (T001) primero. Dentro de cada historia: **[Red] antes de implementar**.
- US1/US2/US3 son mayormente independientes (distintas partes de vista); comparten `orders.css` (editar en serie para evitar conflicto).
- Polish (T011–T015) tras la implementación; **T013** requiere la app corriendo + login; **T015 es la ÚLTIMA** (diff final incl. docs).

## Paralelizables

- Red de historias distintas: T002 (US1), T005 (US2), T007/T009 (US3) — ficheros de test separados.

## MVP y obligatoriedad

**MVP = US1 + US2** (tarjeta + cabecera). US3 (notas/evidencia) completa la fidelidad del detalle. **Polish
(T011–T015) obligatorio para merge**; la **aprobación humana de fidelidad** (T013) es el checkpoint en G3/PR.
