# Tasks: Reskin del front (refresh del design system + tema oscuro) — FE-5 / 017

**Feature dir**: `specs/017-front-reskin/` · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)
· **Ámbito**: solo `frontend/` + `docs/design-system.md`. Sin backend/contratos.

**Convención**: TDD (fase **Red** con commit del test en rojo antes de implementar). Todo por tokens
(0 estilos sueltos). `[P]` = paralelizable (fichero distinto, sin dependencia pendiente).

---

## Phase 1 — Setup

- [ ] T001 Verificar baseline en verde antes de tocar nada: `cd frontend && npm ci && npm run lint && npm run typecheck && npm run test` (dejar constancia de que la suite existente pasa).
- [ ] T002 Fijar la **paleta final** (claro y oscuro) y escribir hex + ratios medidos en `docs/design-system.md §2` (acento naranja de la familia del artifact, texto-sobre-acento, `accent-soft`, 5 estados, neutros, foco), aplicando la regla de fidelidad del acento (spec §Assumptions): si `#DC5A24`+blanco < 4.5:1, separar `--color-primary` accesible del acento vivo (≥3:1). Documentar la decisión.

## Phase 2 — Foundational (bloquea US1 y US2)

- [ ] T003 Reestructurar `frontend/src/ui/tokens.css` al modelo **CSS-first** manteniendo valores actuales (sin cambio visual todavía): `:root` (claro) + `@media (prefers-color-scheme: dark) { :root:not([data-theme]) {…} }` + `:root[data-theme="dark"]` + `:root[data-theme="light"]`, con los mismos nombres de token semántico. (FR-004)
- [ ] T004 [Red] Ampliar `frontend/tests/a11y/contrast-tokens.test.ts` para recorrer la **lista cerrada de 17 pares** (spec §Pares de contraste) **parametrizada por tema** (claro y oscuro), leyendo los valores de `tokens.css`; el test debe **fallar** mientras los valores nuevos no estén (fase Red). (FR-005/SC-003a)

## Phase 3 — User Story 1: reskin en tema claro (P1)

**Objetivo**: acento naranja, paleta de estados y tarjetas suaves en **claro**, sin cambiar función.
**Test independiente**: cada pantalla en claro usa el acento nuevo; badges con color+texto; stylelint 0
sueltos; suite existente en verde.

- [ ] T005 [Red] [US1] Añadir test de render (`frontend/tests/unit/accent-primary.test.tsx`) que verifique que la acción **primaria** de cada pantalla expone la clase de acento (`btn--primary`) y que el badge de cada estado renderiza etiqueta de texto (color no único). (FR-002/FR-003/SC-003)
- [ ] T006 [US1] Fijar los **valores claros** re-tematizados en `frontend/src/ui/tokens.css` (acento, `--color-primary`(-hover), texto-sobre-acento, `accent-soft`, `--status-*-bg/fg` de los 5 estados, neutros, foco, radios `--radius-*`, sombras `--shadow-*`). → hace pasar la mitad clara de T004.
- [ ] T007 [P] [US1] Reestilar componentes base en `frontend/src/ui/components.css` (`.btn*`, `.badge*`, `.field*`, tarjetas/superficies, `.dialog*`) usando solo tokens; radios/sombras suaves.
- [ ] T008 [P] [US1] Revisar `frontend/src/features/shell/shell.css` y `frontend/src/features/orders/orders.css` para que consuman los tokens actualizados (sin literales nuevos).
- [ ] T009 [US1] Actualizar `docs/design-system.md` §2 (tabla de tokens claros) y §4 (radios/elevación) con los valores nuevos.
- [ ] T010 [US1] Verificar US1: `npm run lint` (0 sueltos, SC-001), `npm run build` (SC-002), `npm run test` (T004 clara + T005 + suite existente en verde). Ajustar valores si algún par de contraste claro falla.

**Checkpoint US1**: reskin claro completo y demostrable por sí solo.

## Phase 4 — User Story 2: tema oscuro + conmutador (P1)

**Objetivo**: tema oscuro CSS-first con conmutador (light/dark/system) persistido, contraste AA en oscuro.
**Test independiente**: `data-theme`/`prefers-color-scheme` conmutan; persiste; «sistema» revierte; ratios
oscuros AA; anti-FOUC.

- [ ] T011 [Red] [US2] Tests del store de tema (`frontend/tests/unit/theme-store.test.ts`): precedencia usuario>SO>claro; «claro/oscuro» fija `data-theme`; «sistema» elimina atributo y borra la clave; fallo de `localStorage` → aplica en memoria sin lanzar; sync por evento `storage`; **solo** se escribe la clave de tema. (FR-004/FR-004b/FR-016/SC-006/SC-007)
- [ ] T012 [Red] [US2] Test del `ThemeToggle` (`frontend/tests/unit/theme-toggle.test.tsx`): control accesible (nombre, teclado, foco), refleja la elección activa, no importa el cliente API (sin fetch). (FR-004b/SC-008)
- [ ] T013 [Red] [US2] Test de preservación de foco (`frontend/tests/unit/theme-focus.test.tsx`): tras cambiar de tema por el conmutador, el elemento enfocado sigue enfocado (no hay remonte). (SC-006/H-014)
- [ ] T014 [US2] Fijar los **valores oscuros** de todos los tokens en `frontend/src/ui/tokens.css` (`@media dark` + `[data-theme="dark"]`). → hace pasar la mitad oscura de T004.
- [ ] T015 [US2] Implementar `frontend/src/ui/theme.ts`: utilidad única (lee/escribe la clave de tema, aplica `data-theme`, resuelve efectivo), degradación si `localStorage` falla, suscripción a `storage`. → pasa T011.
- [ ] T016 [US2] Añadir el **script inline anti-FOUC** en `frontend/index.html` (`<head>`, previo a React) que fije `data-theme` desde la misma clave/lógica que `theme.ts`; el store de React lee el `data-theme` ya aplicado (sin recalcular). (FR-013/SC-009)
- [ ] T017 [US2] Implementar `frontend/src/ui/ThemeToggle.tsx` + export en `frontend/src/ui/index.ts`; montarlo en `frontend/src/features/shell/AppShell.tsx`. → pasa T012/T013.
- [ ] T018 [US2] Reescribir `docs/design-system.md §2.4` (tema oscuro: modelo CSS-first, precedencia, tabla de valores oscuros) y §2 (nota del conmutador).
- [ ] T019 [US2] Verificar US2: `npm run test` (T004 oscura + T011/T012/T013 + suite), `npm run lint`, `npm run build`; `vitest-axe` 0 serias/críticas. Validación manual del quickstart (conmutador, persistencia, anti-FOUC).

**Checkpoint US2**: tema oscuro + conmutador completos y accesibles.

## Phase 5 — User Story 3: Stepper + tarjeta de resumen IA (P2, obligatoria)

**Objetivo**: Stepper del FSM en el detalle y tarjeta IA reestilada. **P2 = orden de entrega, no opcional**
(SC-005 bloquea G3).
**Test independiente**: el detalle en cada estado pinta el paso actual; tarjeta con guardián completo.

- [ ] T020 [Red] [US3] Test del `Stepper` (`frontend/tests/unit/stepper.test.tsx`): para cada uno de los 5 estados del FSM, marca previos=completados, actual=here, y comunica el estado **por texto** (no solo color/posición); sin fetch (pureza). (FR-006/FR-014/SC-005/SC-008)
- [ ] T021 [Red] [US3] Test de la tarjeta IA (`frontend/tests/unit/summary-card.test.tsx`): muestra el texto de guardián **completo** (sin `overflow:hidden`/altura fija/line-clamp) y usa **las mismas props** que hoy (sin data-binding nuevo). (FR-008)
- [ ] T022 [US3] Implementar `frontend/src/ui/Stepper.tsx` + export en `index.ts`; montarlo en `frontend/src/features/orders/OrderDetailView.tsx` a partir del `order.status` ya autorizado. → pasa T020.
- [ ] T023 [US3] Reestilar `frontend/src/features/orders/IncidentSummaryPanel.tsx` + reglas `.ai-summary*` en `components.css` (acento de revisión, guardián sin truncar), sin tocar sus props. → pasa T021.
- [ ] T024 [US3] Actualizar `docs/design-system.md §6` (inventario: **Stepper**, **ThemeToggle**, notas a11y).
- [ ] T025 [US3] Verificar US3: `npm run test` (T020/T021 + suite), `npm run lint`, `npm run build`, `vitest-axe`.

## Phase 6 — Polish & cross-cutting

- [ ] T026 [Red] Test de **regresión RBAC del reskin** (`frontend/tests/unit/rbac-reskin-regression.test.tsx`): para ≥1 control por rol (reasignar=dispatcher, aprobar/rechazar=supervisor, acción de técnico) confirma que el ocultamiento/deshabilitación por rol se mantiene tras el reskin. (FR-015/SC-010)
- [ ] T027 Comprobar SC-004 de forma determinista: `git diff` de los ficheros de test RBAC (`tests/unit/fe*-detail-rbac.*`, `fe*-review-actions.*`, `fe*-reassign-*`, `*-rbac*`) **no** toca líneas de aserción (solo, si acaso, literales de clase); documentar el chequeo.
- [ ] T028 [P] Verificar `prefers-reduced-motion`: regla global en `tokens.css` que neutraliza `transition`/`animation` en `*` (FR-010) y que aplica a Stepper/ThemeToggle/hover.
- [ ] T029 [P] Verificar responsive (FR-009): sin scroll horizontal del `body` a 320px y con zoom 200%; master-detail ≥1024px intacto (test/inspección; e2e existente en verde).
- [ ] T030 Actualizar `docs/traceability.md` con las filas FR-001..FR-016 → componente → tarea → test de esta feature.
- [ ] T031 Verificación final completa (quickstart §1): `npm run lint && npm run typecheck && npm run build && npm run test` en verde + `vitest-axe` 0 serias/críticas + test de ratios 17 pares × 2 temas en verde. Sin regresiones funcionales.

---

## Dependencias y orden

- **Setup (T001–T002)** → **Foundational (T003–T004)** → US1 → US2 → US3 → Polish.
- US1 (claro) y US2 (oscuro) comparten `tokens.css` y el test de contraste (T004): US2 completa la mitad
  oscura. US3 depende del reskin base (US1) para estilos coherentes.
- **MVP**: US1 (reskin claro) es entregable y demostrable por sí solo.

## Paralelización

- Dentro de US1: T007 y T008 en paralelo tras T006.
- Los tests [Red] de cada US (T005; T011/T012/T013; T020/T021; T026) pueden escribirse en paralelo al
  inicio de su fase.
- Polish: T028 y T029 en paralelo.

## Trazabilidad rápida FR → tareas

FR-001→T006/T007/T008/T010 · FR-002→T005/T006 · FR-003→T005/T006 · FR-004→T003/T011/T014/T015 ·
FR-004b→T011/T015/T017 · FR-005→T004/T006/T014 · FR-006→T020/T022 · FR-007→T019/T025/T031 ·
FR-008→T021/T023 · FR-009→T029 · FR-010→T028 · FR-011→T010/T019/T025/T031 · FR-012→T009/T018/T024 ·
FR-013→T016 · FR-014→T020/T022/T012/T017 · FR-015→T026/T027 · FR-016→T011/T015.
