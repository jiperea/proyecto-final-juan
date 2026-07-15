# Gate G1 — 021-front-dual-accent (tras `/speckit-clarify`)

**Fecha**: 2026-07-16 · **Fase**: G1 (calidad de spec) · **Panel**: `revisor-cinico`, `auditor-spec-theater`, `revisor-front-a11y-ux` (RBAC N/A — feature de colores).

## Veredicto final: ✅ **PASS** — 0 BLOQUEANTES

`revisor-front-a11y-ux` APROBADA (pase 7) · `revisor-cinico` APROBADA (pase 6) · `auditor-spec-theater` APROBADA (pase 5).

## Convergencia (7 pases)

| Pase | Resultado |
|------|-----------|
| 1 | 2 BLOQ (vivo al texto del Stepper F-001, "marca" es texto F-002) + ALTAs |
| 2 | 1 BLOQ (US1/AC1 sin propagar F-101) + ALTAs |
| 3 | 0 BLOQ; ALTAs (offset del foco, selectores reales) |
| 4 | 1 BLOQ (alcance: `.order-item` fuera de src/ui F-107) |
| 5 | 1 BLOQ (US3 sin propagar el alcance F-108) |
| 6 | 1 BLOQ (AC2 de US3 sin propagar F-109) |
| **7** | **0 BLOQ — APROBADA** (F-110 cosmético cerrado) |

## Decisiones clave

- **Alcance del vivo acotado a 3 superficies SIN texto** (≥3:1): anillo de foco (`--color-focus-ring`),
  punto del Stepper (`.stepper__step--current .stepper__dot`), borde de selección
  (`.order-item[aria-current="true"]`). El **texto** (marca, etiquetas, botones) sigue en `--color-primary`
  (≥4.5:1). Valores exactos del artifact: `#DC5A24` claro / `#FF7A45` oscuro.
- **AA verificado por test** (contrast-tokens ampliado a umbral 3:1) + **verificación visual con Playwright
  MCP** (3 pantallas × claro/oscuro) con **aprobación humana** en G3/PR (US1 estético).
- **Alcance de solo-CSS**: únicos ficheros de producción = `.css` (`src/ui/*.css` + `features/orders/orders.css`);
  0 `.ts`/`.tsx` de producción; 0 backend/contracts/domain. Sin cambiar la config de lint (tokens.css ignorado).
- Decisión documentada: el **botón primario** se mantiene en `--color-primary` en ambos temas (el botón
  vivo+tinta-oscura en oscuro queda como refinamiento futuro).

## Nota de proceso (lección `gate-remediation-spiral`)

Los BLOQUEANTES de los pases 4/5/6 fueron **todos propagación textual incompleta** del mismo hecho de alcance
(orders.css permitido) a secciones paralelas (US1, US3, AC2). Se cerró con un **barrido automático de
propagación**. Los 2 BLOQ del pase 1 (diseño real: vivo sobre texto) sí eran de fondo y se resolvieron
**simplificando** el conjunto del vivo. Lección reforzada: propagar cada cambio a TODAS las secciones a la vez.

> Avance autorizado a `/speckit-plan`.
