# Implementation Plan: Doble token de acento (FE-7)

**Branch**: `021-front-dual-accent` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/021-front-dual-accent/spec.md`

## Summary

Añadir un token `--color-accent-vivid` (`#DC5A24` claro / `#FF7A45` oscuro) y aplicarlo a **3 superficies sin
texto** (anillo de foco, punto del paso actual del Stepper, borde de selección del master-detail) para
recuperar la fidelidad del artifact **sin bajar de WCAG AA** (esas superficies solo exigen ≥3:1). El **texto**
(botones, marca, etiquetas) sigue en `--color-primary` (≥4.5:1). Cambios **solo CSS**; verificación por
contrast-test (umbral 3:1) + **capturas Playwright MCP** (claro/oscuro) con aprobación humana en G3/PR.

> **Sin research/data-model/contracts** — feature de **presentación sin endpoints ni IA** (como FE-5/FE-6).

## Technical Context

**Language/Stack**: CSS custom properties (design tokens) en `frontend/src/ui/tokens.css`; consumo en
`frontend/src/ui/components.css` (foco, stepper) y `frontend/src/features/orders/orders.css` (selección).
React 18 + Vite ya existentes. **Testing**: Vitest — `tests/a11y/contrast-tokens.test.ts` (ampliado a umbral
3:1) + un test de uso de token/anti-hex (`tests/unit/accent-vivid.test.ts`); axe suite existente. Playwright
MCP para capturas. **Sin cambios `.ts`/`.tsx` de producción.**

**Scope**: 1 token nuevo (4 bloques de tema) + recolorear 3 superficies + normalizar `outline-offset` a ≥2px
en `.field__input` + doc en `docs/design-system.md`. **0** backend/contracts/domain.

## Constitution Check

*GATE: 0 casillas sin resolver; N/A justificadas, ninguna de seguridad.*

- **Contract-First (II)** — **N/A**: sin endpoints (feature de tokens/CSS).
- **RBAC/seguridad (IV, IX, XI)** — **N/A**: no toca lógica de control de acceso (invariante de FE-6 heredado;
  solo cambia colores; el vivo restringe `apiFetch`? no aplica — es CSS). Verificado en G1 (RBAC N/A).
- **Hexagonal (III)** — **N/A**: frontend; no toca `backend/`.
- **Calidad/verificación (V, VI, VII, XIII, XIV)** — **aplica y se cumple**: FR en EARS; trazabilidad
  RF→artefacto→test; SC medibles por contrast-test/axe/`git diff` (sin promptfoo — sin IA); gates G1(PASS)/
  G2/G3. **TDD**: el contrast-test del vivo se escribe primero (rojo: aún sin token/uso) → verde al implementar.

**Resultado**: PASS (3 N/A justificadas sin afectar seguridad; gate de calidad cumplido).

## Project Structure

```text
specs/021-front-dual-accent/  → spec.md ✅ · plan.md · tasks.md · checklists/ ✅ · gates/gate-G1 ✅

frontend/
├── src/ui/tokens.css               # + --color-accent-vivid (4 bloques) + --color-focus-ring → vivo
├── src/ui/components.css           # .stepper__step--current .stepper__dot → vivo; .field__input offset ≥2px
├── src/features/orders/orders.css  # .order-item[aria-current="true"] → borde vivo
└── tests/
    ├── a11y/contrast-tokens.test.ts   # ampliado: vivo vs bg/surface/surface-2 ≥3:1 (2 temas)
    └── unit/accent-vivid.test.ts      # token en 4 bloques + uso var() + anti-hex + check inverso
docs/design-system.md               # entrada de --color-accent-vivid (regla de uso)
docs/traceability.md                # fila FE-7 (RF→artefacto→test) — entregable de doc (K-003)
```

**Structure Decision**: intervención **solo CSS** en `src/ui/` + `features/orders/orders.css` (donde vive el
selector de selección) + doc + tests. Sin `.ts`/`.tsx` de producción; 0 backend/contracts/domain (SC-006).

## Complexity Tracking

| Punto | Nota |
|-------|------|
| G1 tardó 7 pases | Espiral de propagación textual (memoria `gate-remediation-spiral`); el **diseño** (3 superficies, AA) está estable desde el pase 3. Implementación pequeña y de bajo riesgo. |
| Verificación estética subjetiva | El AA lo garantiza el test; el "se parece al artifact" es **aprobación humana** con capturas Playwright MCP en G3/PR (FR-006). |
