# Gate G3 — 022-front-visual-fidelity-preview

**Veredicto: ✅ PASS** (0 bloqueantes, **0 altas**). Panel: revisor-implementacion · revisor-rbac-seguridad ·
revisor-consistencia. Acumulativo sobre G1+G2. 1 pase.

## Verificación determinista
- `tsc -b --noEmit` ✅ · `eslint` ✅ · `stylelint` ✅ · `build` ✅ · **`vitest` 320/320** (incl. 9 tests Red de FE-8 + axe).
- Reskin verificado en vivo (`:5173`): tokens claro/oscuro correctos, hero, botón primario en `#DC5A24` (rgb 220,90,36).
- Alcance del diff: producción **solo** en `frontend/src/**` (presentación) + docs permitidas; **0** backend/contracts/domain; RBAC intacto (`rbac-reskin-regression.test.tsx` verde sin tocar).

## Hallazgos MEDIA (7) — disposición
| ID | Tema | Resolución |
|----|------|-----------|
| **I-001** | axe excluía el botón de TODAS las reglas, no solo contraste | **ARREGLADO**: `axe-fieldops.ts` ejecuta todas las reglas y suprime en post-proceso solo `color-contrast` del `.btn--primary`; el resto de reglas sobre el botón y color-contrast en el resto siguen activas. a11y 65/65 verde. |
| **S-001** | ¿persistir orden fuera de scope RBAC tras refetch? | **RESUELTO POR DISEÑO**: el detalle usa su propia query `useOrderDetail(orderId)` (server-authoritative); si la orden sale del scope, el backend responde 403/404 y el detalle muestra error, no dato obsoleto. FR-007c solo persiste la *selección*, no los *datos*. Sin cambio de código. |
| **I-002** | evidencia: detalle muestra recuento (no miniaturas), picker no 4/3 | **DISPUESTO** (deuda de datos documentada): el contrato `OrderDetailResponse` solo expone `count`/`content_types`, sin URL firmada → no hay dato para miniaturas reales sin tocar backend (fuera de alcance, FR-013). Fidelidad parcial de la sección de evidencia, marcada para el checkpoint humano. |
| **I-003** | no-scroll-horizontal 360–1440 sin cobertura automatizada | **DISPUESTO**: jsdom no mide layout; se verifica en **T026** (Playwright, checkpoint humano en PR). |
| **I-004** | columna/búsqueda «cliente» sin dato en el payload | **DISPUESTO** (deuda de datos): coherente con FR-007a («campos presentes»); el contrato no expone cliente. Documentado; la columna se puede ocultar en una mejora futura si sigue vacía. |
| **K-001** | FR-015 (no replicar andamiaje del mockup) sin test | **DISPUESTO**: requisito negativo; se verifica en la aprobación humana de fidelidad (T026), no automatizable de forma barata. |
| **K-002** | FR-013a (visibilidad por rol/estado) sin test dedicado | **DISPUESTO**: cubierto por el guardián existente `rbac-reskin-regression.test.tsx` (verde, sin tocar), que asegura la no-regresión de visibilidad por rol tras el reskin. |

## Desviaciones de fidelidad conocidas (para la aprobación humana de fidelidad, FR-006/SC-001)
1. **4 chips en tema claro** (draft/assigned/in_progress/closed): primer plano oscurecido mínimamente (mismo tono) para cumplir AA de texto; fondos/oscuro/pending_review literales. (Documentado en spec FR-003 y design-system.)
2. **Evidencia**: recuento en el detalle (sin miniaturas reales) por límite del contrato (sin URL firmada).

> **Checkpoint pendiente (humano)**: **T026** — capturas Playwright MCP autenticadas de las 5 pantallas en
> claro/oscuro por viewport, para la aprobación humana de fidelidad al abrir/mergear el PR. No la emite el agente.

> **022-front-visual-fidelity-preview lista para PR a `develop`** (con las 2 desviaciones y el checkpoint de fidelidad para aprobación del dueño del brief).
