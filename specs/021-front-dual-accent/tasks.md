# Tasks: Doble token de acento (FE-7 · 021)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · Presentación (solo CSS), sin endpoints/IA/backend.

> Proporcionalidad (XV): implementación pequeña. Solo `.css` de producción + doc + tests. 0 `.ts`/`.tsx` de
> producción, 0 backend/contracts/domain.

## Phase 1: Fase Red (tests primero)

- [x] T001 [US2] **[Red]** Ampliar `frontend/tests/a11y/contrast-tokens.test.ts` para el **umbral 3:1**:
  añadir pares `--color-accent-vivid` vs `--color-bg`/`--color-surface`/`--color-surface-2` en **claro y
  oscuro** (leer los 4 bloques de tema, no solo 2). Debe **fallar** aún (token inexistente) — commit en rojo
  (FR-004/SC-002).
- [x] T002 [P] [US1] **[Red]** Crear `frontend/tests/unit/accent-vivid.test.ts`: (a) el token existe con
  `#DC5A24`/`#FF7A45` en los **4 bloques** de `tokens.css`; (b) el vivo se consume por `var(--color-accent-vivid)`
  en los 3 selectores (foco, `.stepper__step--current .stepper__dot`, `.order-item[aria-current="true"]`);
  (c) **anti-hex**: `#DC5A24`/`#FF7A45` no aparece como literal en CSS de producción fuera de `tokens.css`;
  (d) **check inverso**: `--color-accent-vivid` no se usa fuera de esos 3 sitios (grep sobre `frontend/src/**/*.css`,
  excluye `docs/`/`tests/`); (e) **offset del foco**: `outline-offset` ≥2px en los **4 consumidores** de
  `--color-focus-ring` (`.btn`, `.field__input`, `.order-item`, `.theme-toggle__option`) — F-001/K-002/H-002.
  Debe **fallar** aún (FR-001/FR-002/FR-003a).

## Phase 2: Implementación (verde) — solo CSS

- [x] T003 [US1] En `frontend/src/ui/tokens.css`: definir `--color-accent-vivid` (**`#DC5A24`** en `:root` y
  `[data-theme=light]`; **`#FF7A45`** en `@media (prefers-color-scheme: dark)` y `[data-theme=dark]`) y
  cambiar el **valor de `--color-focus-ring`** a `var(--color-accent-vivid)` en los 4 bloques (FR-001/FR-002).
- [x] T004 [US1] En `frontend/src/ui/components.css`: (a) `.stepper__step--current .stepper__dot` → **`background`
  Y `border-color`** a `var(--color-accent-vivid)` (hoy ambos son `--color-primary`; cambiar los DOS para no
  dejar residual — F-002; la **etiqueta** de texto sigue en `--color-primary`); (b) normalizar
  `.field__input:focus-visible { outline-offset }` a **≥2px** (hoy 1px) para igualar a los demás consumidores
  del anillo de foco (FR-002/H-001-F-104). Sustituir sin dejar reglas antiguas (FR-003a).
- [x] T005 [US1] En `frontend/src/features/orders/orders.css`: `.order-item[aria-current="true"]` → borde/acento
  `var(--color-accent-vivid)` (sustituir el `--color-primary` previo, sin coexistencia; FR-002/FR-003a).
- [x] T006 [US2] Verificar que **T001 y T002 pasan** en verde tras T003–T005; ajustar si algún par del vivo
  no llega a 3:1 (no debería: #DC5A24 sobre blanco ≈3.4:1; #FF7A45 sobre oscuro ≈AA). Si un par fallara, es
  señal de que el fondo real difiere — revisar (no relajar el umbral).

## Phase 3: No-regresión, doc y evidencia visual

- [x] T007 [US3] Correr los gates del front y dejarlos **verdes**: `cd frontend && npm run lint`,
  `tsc --noEmit`, `stylelint`, `build`, `vitest` (suite completa, incl. axe FR-005). 0 regresiones.
- [x] T008 [US3] Verificar **alcance sobre el DIFF FINAL** (tras T009/T010, no antes — H-001):
  `git diff --name-only develop` → únicos ficheros de producción `.css` (`src/ui/*.css` +
  `features/orders/orders.css`); 0 `.ts`/`.tsx` de producción (los `.ts` solo en `tests/`); docs permitidos =
  `docs/design-system.md` + `docs/traceability.md`; 0 backend/contracts/domain (FR-007/SC-006). **Es la última
  verificación antes del PR.**
- [x] T009 [US1] Documentar `--color-accent-vivid` en `docs/design-system.md` (valor claro/oscuro + regla de
  uso "solo superficies sin texto, ≥3:1; nunca bajo texto") (FR-009/SC-007).
- [x] T010 [US1] **Capturas Playwright MCP** en **claro y oscuro**, cada pantalla en **su viewport de rol**
  (F-004): **detalle de técnico en móvil ≤390px**; **revisión de supervisor** y **listado del dispatcher** en
  **escritorio master-detail ≥1024px**. Adjuntar al PR para la **aprobación humana de fidelidad**
  (FR-006/SC-004). Actualizar `docs/traceability.md` (fila FE-7) — la trazabilidad de spec ya tiene IDs reales.

## Dependencias

- **T001/T002 (Red)** antes de **T003–T005 (verde)**. T006 confirma verde tras la implementación.
- T007 (gates) tras la implementación; T009 (doc) y T010 (capturas + traceability.md) después; **T008
  (alcance) es la ÚLTIMA**, sobre el diff final que incluye docs (H-001). T010 requiere la app corriendo.

## MVP y obligatoriedad

MVP = el token + las 3 superficies + AA verde (US1+US2). **US3 (T007–T008) es obligatoria para merge**
(no-regresión + alcance). La **aprobación humana de las capturas (T010/FR-006)** es el checkpoint de fidelidad
en G3/PR.
