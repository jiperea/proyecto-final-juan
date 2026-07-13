# Tasks: FE-1 · Front shell + acceso + listado (read-only)

**Input**: Design documents from `/specs/009-front-shell-listado/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/README.md
**Tests**: OBLIGATORIOS (Constitution VII — TDD fase Red: el test se escribe y **falla** antes de implementar).
**Organization**: por user story (US1 acceso · US2 listado · US3 detalle), cada una demostrable por separado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (ficheros distintos, sin dependencias pendientes).
- Rutas exactas incluidas. Stack: React 18 + Vite + TS strict · React Router · TanStack Query ·
  openapi-typescript+Zod · CSS Modules+tokens · Vitest+RTL+axe-core+Playwright+MSW (ver plan.md/research.md).

---

## Phase 1: Setup (infraestructura compartida)

- [X] T001 Scaffold `frontend/` (Vite + React 18 + TS strict): `frontend/package.json`, `frontend/tsconfig.json` (strict), `frontend/vite.config.ts` (proxy `/v1` → backend en dev)
- [X] T002 [P] Añadir dependencias en `frontend/package.json`: runtime (react-router-dom, @tanstack/react-query, zod); dev (openapi-typescript, msw, vitest, @testing-library/react, @testing-library/user-event, vitest-axe, @playwright/test, stylelint, eslint + plugins jsx-a11y/react)
- [X] T003 [P] Configurar ESLint en `frontend/.eslintrc.cjs`: regla anti `style={{…}}` literal (FR-017b), regla anti literales color/tamaño en `.ts`/`.tsx` fuera de `src/ui/` (FR-017c), `jsx-a11y`
- [X] T004 [P] Configurar stylelint en `frontend/.stylelintrc.json`: `declaration-property-value-disallowed-list` para hex/px/font fuera de token (FR-017a)
- [X] T005 [P] Script `codegen` en `frontend/package.json`: openapi-typescript desde `contracts/*.openapi.yaml` → `frontend/src/api/generated/`; paso de CI que regenera y `git diff --exit-code` (FR-016 / SC-008b)
- [X] T006 [P] Scaffold MSW en `frontend/mocks/handlers.ts` (handlers derivados del contrato: login/me/refresh/logout, listOrders, getOrderDetail; 200/401/403/404/500/503)
- [X] T007 [P] Configurar test harness: `frontend/vitest.config.ts` (jsdom, setup RTL + MSW + vitest-axe), `frontend/playwright.config.ts`

---

## Phase 2: Foundational (prerrequisitos bloqueantes) ⚠️

**Bloquea todas las user stories.** Incluye el design system y la infraestructura transversal de sesión/seguridad.

- [X] T008 Tokens del design system (CSS variables) en `frontend/src/ui/tokens.css` mapeando `docs/design-system.md` §2-4 (paleta, tipografía, espaciado, radios, foco, 44px)
- [X] T009 [P] Componentes base `Button`, `TextField`, `TextArea` en `frontend/src/ui/` (label asociado, `aria-invalid`/`aria-describedby`, foco visible, ≥44px)
- [X] T010 [P] `StatusBadge` en `frontend/src/ui/StatusBadge.tsx` con mapa `status → {etiqueta_es, tokens}` `satisfies Record<OrderStatus, …>` (color + texto; falla en compilación si falta un estado — FR-007 / SC-008c)
- [X] T011 [P] `EmptyState`, `Spinner` (`aria-busy`), `Toast`/`InlineError` (`role=status`/`role=alert`), `SkipLink` (oculto salvo foco) en `frontend/src/ui/` (FR-026/031/032)
- [X] T012 [P] `MasterDetail` + `BackToList` en `frontend/src/ui/` (landmarks, foco al panel al seleccionar, control de retorno con tokens/≥44px al colapsar <1024px) (FR-025, G2 F-008)
- [X] T013 Zod de respuestas consumidas en `frontend/src/api/schemas.ts`, **generado** del contrato (openapi-zod-client o script; no a mano) e incluido en el diff de CI de T005 (FR-016, G2 F-005)
- [X] T014 Cliente HTTP en `frontend/src/api/client.ts`: `Authorization` desde memoria, `Cache-Control: no-store` en autenticadas (FR-030), superficie de error `{code,…}`
- [X] T015 Interceptor 401→refresh en `frontend/src/api/refresh.ts`: **promesa compartida única** (dedup), **reintento único** de todas las peticiones 401, sin bucle → login (FR-004)
- [X] T016 CSRF double-submit en `frontend/src/api/csrf.ts`: lee cookie `csrf_token`, envía `X-CSRF-Token` en refresh/logout (FR-022)
- [X] T017 Descarte de respuestas en vuelo (AbortController atado al ciclo de sesión) en `frontend/src/api/client.ts` (FR-005/029)
- [X] T018 Contexto de sesión en `frontend/src/features/auth/session.tsx`: `accessToken` en memoria, `session`, `bootStatus`, `pendingRoute` (memoria/router, no storage) (FR-003/021)
- [X] T019 Query client + provider en `frontend/src/app/queryClient.ts`: claves `['me']`/`['orders',role]`/`['order',id]`; `clear()` en logout/cambio de rol (FR-005/029)
- [X] T020 React Router en `frontend/src/routes/index.tsx` (`/login`, `/orders`, `/orders/:id`) + guarda de sesión que conserva destino en memoria (FR-021)
- [X] T021 Gestión de foco de ruta en `frontend/src/routes/focus.ts`: foco al `h1` de la vista destino en cada cambio de ruta (FR-024)
- [X] T022 Handler bfcache en `frontend/src/app/bfcache.ts`: `pageshow` `persisted` → blanqueo síncrono + revalidar sesión → login si no hay (FR-030)
- [X] T023 Mapa de errores español en `frontend/src/i18n/errors.ts` desde `docs/design-system.md §8` (incl. fallback genérico y «Sin conexión») (FR-015/027)
- [X] T024 App shell en `frontend/src/features/shell/AppShell.tsx`: layout responsive campo↔oficina, landmarks `<header>/<nav>/<main>`, skip-link, `prefers-reduced-motion` (FR-019/028/032)

### Tests (Red) — Foundational ⚠️ escribir primero y verlos fallar
- [X] T049 [P] Tests de a11y/infra transversal en `frontend/tests/unit/foundational-a11y.test.tsx`: foco al `h1` en cada cambio de ruta (FR-024); skip-link salta a `<main>` (FR-032); `prefers-reduced-motion` desactiva transiciones (FR-028); `aria-busy` en carga y live-region genérica (FR-026/031); foco al panel al seleccionar en `MasterDetail` (FR-025); **bfcache: `pageshow persisted` → blanqueo síncrono + revalidación → login (FR-030)** — cubre el hueco de TDD de la fundación (G2 F-001/K-001)
- [X] T052 [P] Test Red de cruce **dinámico** de breakpoint del `MasterDetail` en `frontend/tests/unit/master-detail-resize.test.tsx`: con detalle abierto, resize <1024px → colapsa a detalle **con control de retorno visible** (sin trampa); resize ≥1024px → re-expande **conservando la orden seleccionada** (FR-025, G2 F-007)
- [X] T050 [P] Test de contraste **por token** en `frontend/tests/a11y/contrast-tokens.test.ts`: recorre los pares texto/fondo y badges de `docs/design-system.md §2` y verifica ratio ≥4.5:1 / ≥3:1 (SC-005), incl. `--color-focus-ring` sobre cada superficie (G2 K-005/F-006); + regla axe `target-size` para ≥44px (FR-019, G2 F-004)

**Checkpoint**: fundación lista — las user stories pueden empezar.

---

## Phase 3: User Story 1 — Entrar y saber quién soy (P1) 🎯 MVP

**Goal**: login, identidad/rol, logout, refresh silencioso y expiración → relogin sin perder el sitio.
**Independent Test**: entrar con usuario semilla de cada rol, ver nombre+rol, recargar (persiste), expirar access (renueva), logout (purga) → login.

### Tests (Red) ⚠️ escribir primero y verlos fallar
- [X] T025 [P] [US1] Tests login éxito / fallo 401 genérico / `me` identidad+rol (MSW) en `frontend/tests/unit/auth-login.test.tsx`
- [X] T026 [P] [US1] Tests sesión: dedup refresh + reintento único + relogin conservando ruta; re-montaje por cambio de rol; bootstrap (silent refresh + reintento de `me`) (FR-004/023/029) en `frontend/tests/unit/auth-session.test.tsx`
- [X] T027 [P] [US1] Tests logout: purga de estado + best-effort ante cualquier fallo (red/401/403/5xx) + descarte de respuestas en vuelo + `X-CSRF-Token` (FR-005/022) en `frontend/tests/unit/auth-logout.test.tsx`

### Implementación
- [X] T028 [US1] `LoginPage` en `frontend/src/features/auth/LoginPage.tsx` (formulario accesible, mensaje genérico «Credenciales no válidas») (FR-001/002)
- [X] T029 [US1] Bootstrap de sesión en `frontend/src/features/auth/bootstrap.ts` (estado carga + refresh silencioso + `me` con reintento) (FR-023)
- [X] T030 [US1] Acción logout en `frontend/src/features/auth/logout.ts` (purga caché+estado, best-effort, descarte in-flight) (FR-005)
- [X] T031 [US1] Re-montaje por cambio de rol en `frontend/src/features/auth/session.tsx` (purga + re-render bajo rol nuevo) (FR-029)
- [X] T032 [US1] Identidad (nombre+rol) y «Cerrar sesión» en el header del shell en `frontend/src/features/shell/AppShell.tsx` (FR-001)

**Checkpoint**: US1 funcional y testeable de forma independiente.

---

## Phase 4: User Story 2 — Ver mis órdenes por rol (P1)

**Goal**: listado de órdenes del ámbito del rol con estado, más estados vacío/error, sin paginación.
**Independent Test**: cada rol ve exactamente sus órdenes (100%/0 fugas), vacío con mensaje de ámbito, error con reintento.

### Tests (Red) ⚠️
- [X] T033 [P] [US2] Tests listado: render 100% del ámbito y 0 de otros roles, vacío (mensaje de rol), error+reintento, refetch-on-mount + «Actualizar», live-region en cambio de estado (MSW) en `frontend/tests/unit/orders-list.test.tsx`
- [X] T034 [P] [US2] Test a11y pantalla de listado (axe, 0 serias) en `frontend/tests/a11y/orders-list.a11y.test.tsx`
- [X] T051 [P] [US2] Tests RBAC espejo y layout en `frontend/tests/unit/orders-list-rbac.test.tsx`: 403 de `listOrders` → estado «sin-permiso» distinguible del error 503 (FR-014, G2 K-003); un `technician` con viewport ≥1024px recibe **una columna** (NO master-detail), dispatcher/supervisor sí master-detail (FR-019, G2 F-002)

### Implementación
- [X] T035 [P] [US2] Hook `useOrderList` en `frontend/src/features/orders/useOrderList.ts` (`['orders',role]`, refetch on mount, control «Actualizar») (FR-006/009b)
- [X] T036 [P] [US2] `OrderCard` (<1024px) / `OrderRow` (≥1024px, umbral `--bp-lg`) en `frontend/src/features/orders/OrderItem.tsx` (campos del contrato + `StatusBadge`) (FR-006/007, G2 F-009)
- [X] T037 [US2] `OrdersListPage` en `frontend/src/features/orders/OrdersListPage.tsx` con 4 estados (cargando `aria-busy`, vacío, error+reintento con live-region, sin-permiso) (FR-008/009/026/031)
- [X] T038 [US2] Render de lista completa sin control de paginación (FR-010) en `OrdersListPage.tsx`

**Checkpoint**: US1 + US2 funcionales e independientes.

---

## Phase 5: User Story 3 — Abrir el detalle de una orden (P2)

**Goal**: detalle solo-lectura por rol; motivo de rechazo al technician dueño; 404 uniforme; error/refresh.
**Independent Test**: abrir orden del ámbito y ver campos del rol; dueño con rechazo sin atender ve el motivo; dispatcher sin notas/evidencia; id fuera de ámbito → mensaje uniforme.

### Tests (Red) ⚠️
- [X] T039 [P] [US3] Tests detalle: campos por presencia, `notes` escapado (sin HTML crudo), motivo de rechazo al dueño, no-disponible uniforme (404), error 500/503, «Actualizar», **live-region `role=alert` cuando «Actualizar» falla sin cambio de ruta** (FR-031, G2 F-003) (MSW) en `frontend/tests/unit/order-detail.test.tsx`
- [X] T040 [P] [US3] Test a11y pantalla de detalle (axe) en `frontend/tests/a11y/order-detail.a11y.test.tsx`

### Implementación
- [X] T041 [P] [US3] Hook `useOrderDetail` en `frontend/src/features/orders/useOrderDetail.ts` (`['order',id]`, refetch on mount, «Actualizar») (FR-011)
- [X] T042 [US3] `OrderDetailPage` en `frontend/src/features/orders/OrderDetailPage.tsx` (solo-lectura, campos por presencia, `notes` escapado, bloque de motivo de rechazo, mensaje uniforme, error 500/503, live-region en cambio de estado sin ruta) (FR-011/011b/012/013/013b/031)
- [X] T043 [US3] Integración master-detail en `frontend/src/features/orders/` + `ui/MasterDetail` (placeholder sin id, foco al panel al seleccionar, sin prefetch, colapso/re-expansión al cruzar 1024px conservando selección) (FR-025)

**Checkpoint**: las tres user stories independientes y funcionales.

---

## Phase 6: Polish & transversales

- [ ] T044 [P] E2E Playwright en `frontend/tests/e2e/`: navegación por teclado (SC-004), reflow 320px/zoom 200% (SC-007), bfcache (FR-030), flujos por rol (login→listado→detalle), **barrido de que toda vista/estado expone un control de retorno navegable** (SC-001, G2 K-004)
- [ ] T045 [P] Barrido a11y axe en todas las pantallas y estados (login, listado, detalle, vacío/error/sin-permiso) — 0 violaciones serias/críticas (SC-003)
- [ ] T046 Cablear gates deterministas en `frontend/package.json` + CI: `lint` (stylelint+eslint, SC-008a), `typecheck` (tsc strict + badge exhaustivo SC-008c), `codegen` diff (SC-008b)
- [ ] T047 [P] Actualizar `docs/traceability.md` con FR→endpoint→tarea→test de FE-1
- [ ] T048 Validación `quickstart.md`: front + back (docker compose) + tests en verde a la vez («definición de hecho»)

---

## Dependencies & Execution Order

- **Setup (P1)** → sin dependencias.
- **Foundational (P2)** → depende de Setup; **bloquea** todas las US. Dentro: T008 antes de componentes;
  T013-T017 (api) antes de T018-T019 (sesión/query); T020-T024 (router/shell) tras sesión.
- **US1/US2/US3 (P3-5)** → tras Foundational. US1 primero (MVP). US2 y US3 pueden ir en paralelo tras US1
  (US3 consume el shell master-detail y la sesión; US2 el listado). Cada una testeable por separado.
- **Polish (P6)** → tras las US deseadas.

### Paralelizables
- Setup: T002-T007 [P].
- Foundational: T009-T012 [P] (componentes ui); el resto secuencial por acoplamiento (api→sesión→router/shell).
- Por historia: los tests [P] juntos; hooks/componentes [P] antes de la página que los orquesta.

## Implementation Strategy

- **MVP** = Setup + Foundational + **US1** (entrar/saber quién soy/salir). Parar y validar.
- **Incremental**: +US2 (listado) → +US3 (detalle). Cada una demostrable sin romper las previas.
- **TDD**: en cada historia, commit de los tests en **rojo** (T025-T027 / T033-T034 / T039-T040) antes de
  implementar. Verificar que fallan primero.

## Notes

- FE-1 no muta órdenes (read-side); sin endpoints nuevos (consume contratos congelados).
- Trazabilidad completa FR→tarea en spec.md §Trazabilidad + `docs/traceability.md` (T047).
- Gates de calidad = tooling determinista de front (axe/RTL/Playwright/lint/codegen), no promptfoo (sin IA).
