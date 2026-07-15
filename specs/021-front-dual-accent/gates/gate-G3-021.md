# Gate G3 — 021-front-dual-accent (tras `/speckit-implement` + tests)

**Fecha**: 2026-07-16 · **Fase**: G3 (implementación vs spec, acumulativo) · **Panel**: `revisor-implementacion` + `revisor-front-a11y-ux`. Sin `promptfoo` (sin IA).

## Veredicto: ✅ **PASS** — 0 BLOQUEANTES

`revisor-implementacion` APROBADA_CON_COMENTARIOS · `revisor-front-a11y-ux` APROBADA_CON_COMENTARIOS.

## Evidencia verificada

- **FR-001**: `--color-accent-vivid` = `#dc5a24` (claro) / `#ff7a45` (oscuro) en los **4 bloques** de tema;
  `--color-focus-ring` → `var(--color-accent-vivid)`. Test de 4 bloques verde.
- **FR-002/FR-003a**: vivo aplicado **solo** a foco, `.stepper__step--current .stepper__dot` (background **y**
  border) y `.order-item[aria-current="true"]`, vía `var()` (sin hex duplicado, sin residual `--color-primary`);
  el texto (etiqueta del Stepper, marca, botones) sigue en `--color-primary`. `outline-offset` ≥2px en los 4
  consumidores del foco (`.field__input` normalizado 1px→2px).
- **FR-004**: `contrast-tokens.test.ts` (var-aware) verifica vivo vs bg/surface/surface-2 **≥3:1** y textos
  **≥4.5:1** en **ambos temas** — 0 violaciones.
- **FR-007/SC-006**: `git diff` toca **solo** `.css` de producción (tokens/components/orders) + tests + docs;
  **0** `.ts`/`.tsx` de producción, **0** backend/contracts/domain.
- **FR-008**: tsc · eslint · stylelint · build · **vitest 261/261** verdes (sin regresión; incl. axe FR-005).
- **FR-006**: capturas (`e2e/dual-accent-screenshots`, 3 pantallas × 2 temas) generadas y **verificadas
  visualmente**: el vivo renderiza en foco/Stepper/selección; los botones quedan en el acento accesible.
  **Aprobación humana de fidelidad = checkpoint en el PR** (la da el dueño del brief al mergear).

## Hallazgos (MEDIA, no bloqueantes)

| ID | Tema | Resolución |
|----|------|-----------|
| I-001 | Sin commit "rojo" separado (TDD) | Aceptado: enforcement verificado hoy; feature solo-CSS de bajo riesgo. Nota para futuras features. |
| I-002 | El `<h1>` con foco programático muestra el outline azul por defecto (no el vivo) | **Preexistente, fuera de alcance** (esos elementos no están entre los 4 consumidores de `--color-focus-ring`); documentado en el PR para no confundir la revisión de fidelidad. |
| F-002 | Borde de selección de 1px | Verificado **perceptible** en las capturas; engrosar sería fuera de alcance (recolor, no rediseño). |
| F-003 | Hover sobre ítem seleccionado (futuro) | No se añade hover en esta feature; documentado. |

## Nota de proceso

Convergencia: G1 7 pases (bloqueantes = propagación textual + 2 de diseño), G2 2 pases, **G3 1 pase**. Lección
`gate-remediation-spiral` aplicada (simplificar, barrido de propagación). Implementación **solo CSS, 0 fixes de
lógica**.

> **021-front-dual-accent lista para PR a `develop`** (con checkpoint de aprobación de fidelidad al mergear).
