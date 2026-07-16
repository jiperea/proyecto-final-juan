# Tasks: Fidelidad visual del front al preview (FE-8 · 022)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · Presentación (**solo `frontend/`**), sin endpoints/IA/backend/contratos.

> Proporcionalidad (XV): cambio concentrado en `ui/` (tokens + componentes base, «token o nada») + ajustes de
> vistas `features/` + 2 hooks de filtro en cliente. **0 backend/contratos/domain · 0 cambios RBAC.**
> **TDD**: fase Red (test que falla, commit en rojo) antes de implementar tokens y comportamiento nuevo.

## Phase 1: Setup

- [ ] T001 Verificar entorno dev con HMR: `make dev` levanta front (`:5173`) + back; capturar **baseline** (antes) de las 5 pantallas en claro/oscuro con Playwright MCP para comparar la fidelidad al cierre (guardar en `specs/022-front-visual-fidelity-preview/gates/`).
- [ ] T002 Localizar el punto de config de a11y de tests (`frontend/vitest.setup.ts` / config de `vitest-axe`) donde alojar la **supresión ACOTADA y anotada** de contraste del botón primario (FR-010) — se implementa en T024, aquí solo se identifica el fichero.

## Phase 2: US1 — Sistema de diseño fiel al preview (P1) 🎯 MVP

**Objetivo**: tokens del preview (fondo gris, acento vivo, chips con teal + punto, bordes, radios/sombras, pending_review-bg) en claro y oscuro.
**Test independiente**: `getComputedStyle` de los tokens coincide con los valores del artifact en ambos temas.

- [ ] T003 [US1] **[Red]** Crear `frontend/tests/unit/tokens-preview.test.ts`: aserta por `getComputedStyle` los valores del preview en claro y oscuro (4 bloques de `tokens.css`) — fondo `#F4F6F8`/`#0E141A`, surface `#FFFFFF`/`#18212B`, surface-2 `#EDF0F3`/`#212C38`, borde `#E1E6EB`/`#2A3744`, acento vivo `#DC5A24`/`#FF7A45`, y los 5 chips (fg/bg) incl. `in_progress` teal `#0E7C9B`/`#DEF0F5` y `--status-pending_review-bg` `#EDE6FC`/`#2A2140`. Debe **fallar** (FR-001/002/003/004).
- [ ] T004 [US1] En `frontend/src/ui/tokens.css`: actualizar los 4 bloques de tema con los valores del preview (T003) — neutros, acento vivo, paleta de estado (5 chips fg+bg), `--status-pending_review-bg`, radios (`--radius-sm` 9px / `--radius-md` 14px) y `--shadow-1`. Poner T003 en verde (FR-001..004).

## Phase 3: US2 — Técnico: lista y detalle idénticos al preview (P1) 🎯 MVP

**Objetivo**: lista con segmentado «Activas/Todas» + tarjetas; detalle con stepper (morado+halo), notas, evidencia.
**Test independiente**: login `technician@fieldops.test`; lista y detalle en móvil ≤390 (claro/oscuro) = pantallas 02/03 del artifact; el filtro funciona.

- [ ] T005 [P] [US2] **[Red]** `frontend/tests/unit/status-badge-dot.test.tsx`: el chip lleva punto `::before` con `currentColor`; falla hasta T009 (FR-003).
- [ ] T006 [P] [US2] **[Red]** `frontend/tests/unit/stepper-states.test.tsx`: paso done=verde `closed`, current=morado `pending_review` con halo `0 0 0 4px --status-pending_review-bg`, pending=`surface-2`+borde; NO usa acento vivo. Falla hasta T010 (FR-002/006).
- [ ] T007 [P] [US2] **[Red]** `frontend/tests/unit/orders-filter.test.tsx`: segmentado «Activas/Todas» (default «Activas» oculta `closed`); al escribir término, el segmento pasa a «Todas» y filtra por substring insensible a mayúsculas/acentos sobre los campos presentes; 3 estados vacíos con precedencia (FR-005/005a/005b/011b). Falla hasta T011/T012.
- [ ] T008 [US2] Crear `frontend/src/ui/Segmented.tsx` + estilos `.seg` en `components.css`: control accesible (radiogroup/tablist, foco visible, `prefers-reduced-motion`), segmento activo = píldora `--color-surface` + `--shadow-1` (no acento). (FR-005)
- [ ] T009 [US2] En `frontend/src/ui/StatusBadge.tsx` + `components.css`: añadir el punto `::before` (`currentColor`) al chip, con la paleta de T004. Verde T005 (FR-003).
- [ ] T010 [US2] En `frontend/src/ui/Stepper.tsx` + `components.css`: colores por estado del paso (done/current+halo/pending), morado fijo, **sustituir** el naranja de FE-7 en `.stepper__step--current .stepper__dot`. Verde T006 (FR-002/006).
- [ ] T011 [US2] Crear hook `frontend/src/features/orders/useOrderFilter.ts`: estado UI-local (segmento + término) derivado (`useMemo`) del `data` de la query; precedencia búsqueda→«Todas»; se re-deriva en refetch. (FR-005a/007a/011b, H-005)
- [ ] T012 [US2] En `frontend/src/features/orders/OrderList.tsx` / `OrdersView.tsx` + `orders.css`: integrar `Segmented` + `useOrderFilter`; tarjetas del preview (código mono, chip, nombre, cliente, técnico); 3 estados vacíos (FR-005b). Verde T007.
- [ ] T013 [US2] En `frontend/src/features/orders/OrderDetailView.tsx` + `orders.css`: maquetación del detalle del preview (cabecera, stepper, notas, evidencia en miniaturas 4/3 `--radius-sm`); acciones por rol **sin cambiar** su visibilidad (FR-006/013a).

## Phase 4: US3 — Oficina: master-detail del preview (P2)

**Objetivo**: chrome de oficina (topbar buscador+avatar+marca, cabecera de tabla, fila con barra de acento) + buscador en cliente; layout por viewport.
**Test independiente**: login `supervisor@fieldops.test`; escritorio ≥1024 (claro/oscuro) = sección oficina del artifact; buscador filtra; selección persiste.

- [ ] T014 [P] [US3] **[Red]** `frontend/tests/unit/office-search.test.tsx`: el buscador filtra por substring insensible a mayúsculas/acentos sobre campos presentes; al ocultarse (`<1024px`) el término se limpia; selección persiste si el filtro la excluye (nota discreta). Falla hasta T016/T017 (FR-007a/007c/011b).
- [ ] T015 [P] [US3] **[Red]** `frontend/tests/unit/layout-by-viewport.test.tsx`: `<1024px` → apilado; `≥1024px` → master-detail, **independiente del rol**; sin scroll horizontal 360–1440. Falla hasta T016 (FR-011/011a).
- [ ] T016 [US3] En `frontend/src/ui/MasterDetail.tsx` + shell (`frontend/src/features/shell/AppShell.tsx`/`shell.css`, o nuevo `OfficeTopbar.tsx`): topbar (marca «F», buscador, rol, avatar), cabecera de tabla (Código/Orden/Cliente/Estado), fila seleccionada con **barra de acento** (`inset` izq.) + fondo `--color-accent-soft`; layout por viewport (FR-007/011).
- [ ] T017 [US3] Conectar el buscador al hook de filtro (reutilizar/extender `useOrderFilter`): término solo en master-detail, se limpia al ocultarse; selección persistente con nota si queda fuera del filtro (FR-007a/007c). Verde T014.

## Phase 5: US4 — Login y registrar ejecución fieles al preview (P3)

**Objetivo**: login hero + registrar ejecución (rejilla 3-col, tile «+», píldora de requisito).
**Test independiente**: capturar login (sin auth) y, como técnico, registrar ejecución = pantallas 01/04 del artifact.

- [ ] T018 [P] [US4] **[Red]** `frontend/tests/unit/login-hero.test.tsx`: hero centrado con marca «F», wordmark, tagline, 2 campos y botón «Entrar». Falla hasta T020 (FR-009).
- [ ] T019 [P] [US4] **[Red]** `frontend/tests/unit/evidence-capture.test.tsx`: rejilla 3-col con tile «+» (borde discontinuo, **sin** acento), píldora de requisito («✓ N, mínimo 1» / no cumplido). Falla hasta T021 (FR-008, H-004).
- [ ] T020 [US4] En `frontend/src/features/auth/LoginPage.tsx` + estilos: hero centrado del preview (FR-009). Verde T018.
- [ ] T021 [US4] En `frontend/src/features/orders/EvidencePicker.tsx` / `ExecutionForm.tsx` + `orders.css`: rejilla 3-col + tile «+» (muted, sin acento) + píldora de requisito (FR-008). Verde T019.
- [ ] T019b [P] [US4] **[Red]** `frontend/tests/unit/incident-summary-card.test.tsx`: la tarjeta IA usa el token morado `pending_review` (borde/cabecera/fondo `--status-pending_review-bg`) + nota de guardián; **se renderiza solo para supervisor en `pending_review`** y **no** en vistas de otros roles ni otros estados; acepta estado runtime (texto/vacío/insuficiente). Falla hasta T022 (FR-016, S-003/H-007).
- [ ] T022 [US4] En `frontend/src/features/orders/IncidentSummaryPanel.tsx`: tarjeta IA con morado `pending_review` (borde/cabecera/fondo `--status-pending_review-bg`) + nota de guardián; visible **solo** para supervisor en `pending_review`; acepta estado runtime (texto/vacío/insuficiente) (FR-016, S-003/H-007). Verde T019b.

## Phase 6: Polish, verificación y evidencia

- [ ] T023 [US1] Confirmar **disciplina de design system**: 0 hex/px/font sueltos en vistas (`stylelint` + regla de tokens verde); todo valor del preview vive en `tokens.css` (FR-012/SC-003).
- [ ] T024 **Excepción AA (FR-010)**: aplicar el acento vivo + texto blanco en botón primario y añadir en la config de a11y (T002) la **supresión ACOTADA** de contraste **solo** para el botón primario, con comentario que enlaza a FR-010; el resto del contraste queda ≥AA y `≥3:1` no-textual (foco/selección) verde (FR-010/SC-002/002a/005).
- [ ] T025 Correr los gates del front en verde: `cd frontend && npm run lint`, `tsc -b --noEmit`, `stylelint`, `build`, `vitest` (incl. axe). **0 regresiones** vs línea base; build visualmente equivalente a dev (FR-011/SC-004/H-004).
- [ ] T026 **Capturas Playwright MCP** (después) de las 5 pantallas en **claro y oscuro**, cada una en su viewport nativo (técnico→móvil ≤390; oficina→escritorio ≥1024) + **smoke-check** «sin scroll horizontal» en el viewport contrario y en tablet; datos **seed/sintéticos** (sin PII). Adjuntar al PR para **aprobación humana de fidelidad** (rúbrica SC-001) (FR-014/SC-001).
- [ ] T027 Actualizar `docs/traceability.md` (fila **FE-8**: FR→componente/archivo→test) y `docs/design-system.md` (tokens nuevos del preview + regla del acento vivo y su excepción AA) (FR-012).
- [ ] T028 **Verificación de alcance sobre el DIFF FINAL** (última): `git diff --name-only develop` → únicos ficheros de producción en `frontend/src/**` (`.css`/`.tsx` de presentación) + config a11y/tests; docs permitidos = `docs/traceability.md` + `docs/design-system.md`; **0** backend/contracts/domain; **0** cambios de lógica RBAC (FR-013/SC-006).

## Dependencias

- **Setup (T001-T002)** antes de todo.
- **US1 (T003-T004)** es fundacional para el resto (los tokens sostienen todas las vistas).
- Dentro de cada historia: **[Red] antes de implementar**. US2/US3/US4 dependen de US1; entre sí son mayormente independientes (distintas vistas), salvo que US3 reutiliza el hook de filtro de US2 (T011→T017).
- **Polish (T023-T028)** tras la implementación. **T024** (excepción AA) antes de T025 (para que axe quede verde). **T026** requiere la app corriendo. **T028 es la ÚLTIMA** (diff final, incl. docs).

## Paralelizables

- Red de historias distintas: T005/T006/T007 (US2), T014/T015 (US3), T018/T019 (US4) — ficheros de test separados.
- Implementación en ficheros distintos dentro de una historia (p. ej. T009 badge / T010 stepper / T008 segmented).

## MVP y obligatoriedad

**MVP = US1 + US2** (tokens + lista/detalle del técnico: la superficie mínima del brief con el look del artifact).
US3 (oficina) y US4 (login/ejecución) son incrementos. **Polish (T023-T028) obligatorio para merge**; la
**aprobación humana de fidelidad** (T026/FR-006) es el checkpoint en G3/PR.
