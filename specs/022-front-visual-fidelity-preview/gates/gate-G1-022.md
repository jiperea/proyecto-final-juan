# Gate G1 — 022-front-visual-fidelity-preview

**Veredicto: ✅ PASS** (0 bloqueantes). Panel: revisor-cínico · auditor-spec-theater · revisor-rbac-seguridad.

## Resultado
Feature de **presentación** (fidelidad visual del front al artifact de exploración). Tras clarify (5 preguntas)
y remediación adversarial iterativa, el gate converge a **0 bloqueantes**. Todas las ALTAS que fueron surgiendo
se resolvieron en la spec (no se difirieron); las MEDIAS de detalle de implementación se **dispusieron a
`/speckit-plan`** (ver `gates/dispositioned.md`).

## Convergencia (rondas)
| Ronda | Total | Bloq | Altas | Hito |
|------|------|------|------|------|
| 1 | 19 | **1** | 10 | Bloqueante: SC-004 axe ↔ FR-010 sub-AA (contradicción) |
| 2 | 9 | 0 | 3 | Bloqueante resuelto (excepción AA acotada y anotada) |
| 3 | 11 | 0 | 2 | (espiral: FR-011b metió complejidad) |
| 4 | 9 | 0 | 3 | Simplificado el modelo de filtro (XV) |
| 5 | 6 | 0 | 2 | Fix definitivo del filtro (limpiar término al ocultar) |
| 6 | 7 | 0 | 2 | Hex de fondos de chips + token pending_review-bg |
| 7 | 9 | 0 | 2 | Búsqueda prevalece sobre segmento; rango tablet |
| 8 | 6 | 0 | 1 | Segmento→«Todas» al buscar; alcance (construye, no solo reskin) |

## Bloqueante (resuelto en ronda 2)
- **H-001**: SC-004 exigía "0 regresiones incl. axe" mientras FR-010 adopta ~3.4:1 en botón (bajo AA) →
  contradicción. **Resuelto**: excepción AA **única, acotada y anotada** al acento-en-botón; axe activo para
  todo lo demás; SC-002/SC-002a afirman AA de texto y ≥3:1 no-textual (WCAG 1.4.11) en el resto.

## Última ALTA (ronda 8) — resuelta en spec, no diferida
- Orden seleccionada eliminada por el filtro → **FR-007c**: el panel mantiene la orden con nota discreta hasta
  nueva selección/limpiar filtro.

## Dispuesto a /speckit-plan (detalle de implementación, no de spec)
H-004 (acento del «+» de evidencia), H-005 (filtro cliente ↔ refetch/invalidación TanStack), H-006 (umbral
numérico de volumen que dispara paginación), T-002 (ancla de clase de `kicker`). Ninguno cambia alcance ni bloquea.

## Decisiones clave (clarify)
Acento **literal** con excepción AA documentada · replicar vistas de app (no el andamiaje del mockup) +
responsive móvil/escritorio por **viewport** · filtro **en cliente** (segmento «Activas/Todas» + buscador,
búsqueda prevalece) · tarjeta IA replica **estilo** con estado runtime · **paginación diferida**.

> Lección aplicada (`gate-remediation-spiral`): se cortó la espiral **simplificando** el modelo de filtro (XV) y
> disponiendo el detalle de implementación a la fase de plan, en vez de acumular cláusulas.
