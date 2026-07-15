# Tasks: Reskin del front (refresh del design system + tema oscuro) — FE-5 / 017

**Feature dir**: `specs/017-front-reskin/` · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)
· **Ámbito**: solo `frontend/` + `docs/design-system.md`. Sin backend/contratos.

**Convención**: TDD (fase **Red** con commit del test en rojo antes de implementar). Todo por tokens
(0 estilos sueltos). `[P]` = paralelizable (fichero distinto, sin dependencia pendiente).

---

## Phase 1 — Setup

- [X] T001 Verificar baseline en verde antes de tocar nada: `cd frontend && npm ci && npm run lint && npm run typecheck && npm run test` (dejar constancia de que la suite existente pasa).
- [X] T002 Fijar la **paleta final** (claro y oscuro) y escribir hex + ratios medidos en `docs/design-system.md §2` (acento naranja de la familia del artifact, texto-sobre-acento, `accent-soft`, 5 estados, neutros, foco), aplicando la regla de fidelidad del acento (spec §Assumptions): si `#DC5A24`+blanco < 4.5:1, separar `--color-primary` accesible del acento vivo (≥3:1). Documentar la decisión.

## Phase 2 — Foundational (bloquea US1 y US2)

- [X] T003 Reestructurar `frontend/src/ui/tokens.css` al modelo **CSS-first** manteniendo valores actuales (sin cambio visual todavía): `:root` (claro) + `@media (prefers-color-scheme: dark) { :root:not([data-theme]) {…} }` + `:root[data-theme="dark"]` + `:root[data-theme="light"]`, con los mismos nombres de token semántico. (FR-004)
- [X] T004 [Red] Ampliar `frontend/tests/a11y/contrast-tokens.test.ts` para recorrer la **lista cerrada de 18 pares** (spec §Pares de contraste) en un `describe` **por tema**, empezando por el bloque de **tema CLARO**; leer los valores de `tokens.css`. El bloque claro debe **fallar** hasta T006 (Red). El bloque oscuro se añade en US2 (T013b) para que el checkpoint de US1 pueda quedar en verde de forma independiente. (FR-005/SC-003a)
- [X] T004b Reconciliar `frontend/tests/unit/fe3-contrast.test.ts` con la nueva estructura CSS-first de `tokens.css` (tarea de refactor defensivo, **no** TDD-Red): sus 3 pares (text-muted/bg, danger-texto/bg, focus-ring/bg) ya están en la lista cerrada; hacer que lea correctamente los valores del bloque **claro** (sin coger el hex de otro tema por regex) y siga en verde con la paleta nueva, o delegar en la lista compartida. Evita que el re-tematizado (T006) rompa un test existente (SC-004). (K-001/H-002)

## Phase 3 — User Story 1: reskin en tema claro (P1)

**Objetivo**: acento naranja, paleta de estados y tarjetas suaves en **claro**, sin cambiar función.
**Test independiente**: cada pantalla en claro usa el acento nuevo; badges con color+texto; stylelint 0
sueltos; suite existente en verde.

- [X] T005 [Red] [US1] Añadir test de render (`frontend/tests/unit/accent-primary.test.tsx`) que verifique que la acción **primaria** de cada pantalla expone la clase de acento (`btn--primary`) y que el badge de cada estado renderiza etiqueta de texto (color no único). (FR-002/FR-003)
- [X] T006 [US1] Fijar los **valores claros** re-tematizados en `frontend/src/ui/tokens.css` (acento, `--color-primary`(-hover), texto-sobre-acento, `accent-soft`, `--status-*-bg/fg` de los 5 estados, neutros, foco, radios `--radius-*`, sombras `--shadow-*`). → hace pasar la mitad clara de T004.
- [X] T007 [P] [US1] Reestilar componentes base en `frontend/src/ui/components.css` (`.btn*`, `.badge*`, `.field*`, tarjetas/superficies, `.dialog*`) usando solo tokens; radios/sombras suaves.
- [X] T008 [P] [US1] Revisar `frontend/src/features/shell/shell.css` y `frontend/src/features/orders/orders.css` para que consuman los tokens actualizados (sin literales nuevos).
- [X] T009 [US1] Actualizar `docs/design-system.md` §2 (tabla de tokens claros) y §4 (radios/elevación) con los valores nuevos.
- [X] T010 [US1] Verificar US1: `npm run lint` (0 sueltos, SC-001), `npm run build` (SC-002), `npm run test` — **toda la suite en verde de forma independiente**: el bloque **claro** de contraste (T004) pasa, `fe3-contrast` reconciliado (T004b) pasa, T005 y la suite existente pasan. (Aún no existe el bloque oscuro de contraste — se añade en US2 — por lo que US1 no queda en rojo.) Ajustar valores si algún par claro falla.

**Checkpoint US1**: reskin claro completo, con toda la suite en verde y demostrable por sí solo (MVP).

## Phase 4 — User Story 2: tema oscuro + conmutador (P1)

**Objetivo**: tema oscuro CSS-first con conmutador (light/dark/system) persistido, contraste AA en oscuro.
**Test independiente**: `data-theme`/`prefers-color-scheme` conmutan; persiste; «sistema» revierte; ratios
oscuros AA; anti-FOUC.

- [X] T011 [Red] [US2] Tests del store de tema (`frontend/tests/unit/theme-store.test.ts`): precedencia usuario>SO>claro; «claro/oscuro» fija `data-theme`; «sistema» elimina atributo y borra la clave; fallo de `localStorage` → aplica en memoria sin lanzar; sync por evento `storage`; **solo** se escribe la clave de tema. (FR-004/FR-004b/FR-016/SC-006/SC-007)
- [X] T012 [Red] [US2] Test del `ThemeToggle` (`frontend/tests/unit/theme-toggle.test.tsx`): control accesible (nombre, teclado, foco), refleja la elección activa, no importa el cliente API (sin fetch). (FR-004b/SC-008)
- [X] T013 [Red] [US2] Test de preservación de foco (`frontend/tests/unit/theme-focus.test.tsx`): tras cambiar de tema por el conmutador, el elemento enfocado sigue enfocado (no hay remonte). (SC-006/H-014)
- [X] T013b [Red] [US2] Añadir a `frontend/tests/a11y/contrast-tokens.test.ts` el `describe` de **tema OSCURO** (los 18 pares sobre los valores oscuros) y extender `fe3-contrast.test.ts` a oscuro; deben **fallar** hasta T014 (Red). (FR-005/SC-003a/K-001)
- [X] T014 [US2] Fijar los **valores oscuros** de todos los tokens en `frontend/src/ui/tokens.css` (`@media (prefers-color-scheme: dark)` + `[data-theme="dark"]`). → hace pasar el bloque oscuro de T013b.
- [X] T015 [US2] Implementar `frontend/src/ui/theme.ts`: utilidad única que **solo** lee/escribe la clave de tema y aplica/quita `data-theme`; **NO** calcula el tema "resuelto" en modo «sistema» ni usa `matchMedia`/`getComputedStyle` (ese caso lo gobierna la `@media`); degradación si `localStorage` falla; suscripción a `storage`. → pasa T011. (H-003)
- [X] T016 [US2] Añadir el **script inline anti-FOUC** en `frontend/index.html` (`<head>`, previo a React) que fije `data-theme` desde la misma clave/lógica que `theme.ts`; el store de React lee el `data-theme` ya aplicado (sin recalcular). **Anti-drift** (el script inline es JS plano y no puede importar `theme.ts`): exponer la clave y los valores válidos como constante exportada en `theme.ts`, y añadir un test (`frontend/tests/unit/theme-fouc-sync.test.ts`) que lea `frontend/index.html` y **falle** si el string de la clave usado en el script inline no coincide con esa constante. (FR-013/SC-009/H-006)
- [X] T017 [US2] Implementar `frontend/src/ui/ThemeToggle.tsx` + export en `frontend/src/ui/index.ts`; montarlo en `frontend/src/features/shell/AppShell.tsx`. → pasa T012/T013.
- [X] T018 [US2] Reescribir `docs/design-system.md §2.4` (tema oscuro: modelo CSS-first, precedencia, tabla de valores oscuros) y §2 (nota del conmutador).
- [X] T019 [US2] Verificar US2: `npm run test` (T004 oscura + T011/T012/T013 + suite), `npm run lint`, `npm run build`; `vitest-axe` 0 serias/críticas. Validación manual del quickstart (conmutador, persistencia, anti-FOUC).

**Checkpoint US2**: tema oscuro + conmutador completos y accesibles.

## Phase 5 — User Story 3: Stepper + tarjeta de resumen IA (P2, obligatoria)

**Objetivo**: Stepper del FSM en el detalle y tarjeta IA reestilada. **P2 = orden de entrega, no opcional**
(SC-005 bloquea G3).
**Test independiente**: el detalle en cada estado pinta el paso actual; tarjeta con guardián completo.

- [X] T020 [Red] [US3] Test del `Stepper` (`frontend/tests/unit/stepper.test.tsx`): para cada uno de los 5 estados del FSM, marca previos=completados, actual=here, y comunica el estado **por texto** (no solo color/posición); sin fetch (pureza). (FR-006/FR-014/SC-005/SC-008)
- [X] T021 [Red] [US3] Test de la tarjeta IA (`frontend/tests/unit/summary-card.test.tsx`): muestra el texto de guardián **completo** (sin `overflow:hidden`/altura fija/line-clamp), renderiza **la misma prop** que recibe (sin transformar ni añadir campos), y no accede a otros datos de la orden. Aserción explícita de que el texto pintado es exactamente el prop de entrada (la minimización de PII es upstream en 006/007 y no cambia). (FR-008/S-002)
- [X] T022 [US3] Implementar `frontend/src/ui/Stepper.tsx` + export en `index.ts`; montarlo en `frontend/src/features/orders/OrderDetailView.tsx` a partir del `order.status` ya autorizado. → pasa T020.
- [X] T023 [US3] Reestilar `frontend/src/features/orders/IncidentSummaryPanel.tsx` + reglas `.ai-summary*` en `components.css` (acento de revisión, guardián sin truncar), sin tocar sus props. → pasa T021.
- [X] T024 [US3] Actualizar `docs/design-system.md §6` (inventario: **Stepper**, **ThemeToggle**, notas a11y).
- [X] T025 [US3] Verificar US3: `npm run test` (T020/T021 + suite), `npm run lint`, `npm run build`, `vitest-axe`.

## Phase 6 — Polish & cross-cutting

- [X] T026 [Red] Test de **regresión RBAC del reskin** (`frontend/tests/unit/rbac-reskin-regression.test.tsx`): para **cada combinación rol×estado** donde hoy hay un control condicionado — dispatcher: «Reasignar» visible en `assigned` e `in_progress` y ausente en `pending_review`/`closed`; supervisor: «Aprobar»/«Rechazar» solo en `pending_review` (y el gate ≥1024px); técnico asignado: «Iniciar»/«Registrar» en `assigned`/`in_progress` y ausente si no es el asignado — confirma que el ocultamiento/deshabilitación se mantiene tras el reskin. (FR-015/SC-010)
- [X] T027 Crear el guardián determinista de SC-004 como script committeado `frontend/scripts/check-rbac-test-diff.sh` (invocable en CI): hace `git diff` de los ficheros RBAC (`tests/unit/fe*-detail-rbac.*`, `fe*-review-actions.*`, `fe*-reassign-*`, `*-rbac*`) contra la base de la rama y **sale con código ≠0** si alguna **línea de aserción** cambió (patrón de SC-004: `expect(`, matchers, o queries `*ByRole/*ByText` con `name`/texto); solo permite cambios en literales de clase). Añadir su invocación al flujo de verificación. (FR-015/SC-004)
- [X] T028 [Red] [P] Test determinista de `prefers-reduced-motion` (`frontend/tests/unit/reduced-motion.test.ts`): parsea `frontend/src/ui/tokens.css` (postcss o regex) y **falla** si no existe la regla `@media (prefers-reduced-motion: reduce)` que neutraliza `transition`/`animation` sobre el selector `*` (dado que vitest corre con `css:false`, se verifica el texto CSS, no el render). (FR-010)
- [X] T029 [Red] [P] Test e2e de responsive `frontend/tests/e2e/reskin-responsive.spec.ts` (Playwright): en cada pantalla, con viewport 320px y con zoom 200%, aserta `document.body.scrollWidth <= document.body.clientWidth` (sin overflow-x) y que a ≥1024px el layout master-detail está activo. (FR-009/SC-011)
- [X] T030 Actualizar `docs/traceability.md` con las filas FR-001..FR-016 → componente → tarea → test de esta feature.
- [X] T031 Verificación final completa (quickstart §1): `npm run lint && npm run typecheck && npm run build && npm run test` en verde + `vitest-axe` 0 serias/críticas + test de ratios **18 pares × 2 temas** (claro y oscuro) en verde + `check-rbac-test-diff.sh` (SC-004) + `npm run test:e2e` (reskin-responsive, SC-011) en verde. Sin regresiones funcionales.

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
FR-004b→T011/T015/T017 · FR-005→T004/T004b/T006/T013b/T014 · FR-006→T020/T022 · FR-007→T019/T025/T031 ·
FR-008→T021/T023 · FR-009→T029 · FR-010→T028 · FR-011→T010/T019/T025/T031 · FR-012→T009/T018/T024 ·
FR-013→T016 · FR-014→T020/T022/T012/T017 · FR-015→T026/T027 · FR-016→T011/T015.

**SC → tareas:** SC-001→T010 · SC-002→T010/T031 · SC-003a→T004/T013b/T004b · SC-003b→T019/T025 ·
SC-004→T027 · SC-005→T020/T022 · SC-006→T011/T013 · SC-007→T011 · SC-008→T012/T020 · SC-009→T016 ·
SC-010→T026 · SC-011→T029.

> Nota de secuenciación: contraste **claro** (T004) cierra en US1 (checkpoint verde independiente);
> contraste **oscuro** (T013b) cierra en US2. `fe3-contrast.test.ts` se reconcilia en T004b (claro) y se
> extiende a oscuro en T013b (evita romper un test existente al re-tematizar, SC-004).
