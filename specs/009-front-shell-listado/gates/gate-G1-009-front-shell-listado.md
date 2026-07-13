# Gate G1 · FE-1 (009-front-shell-listado) — historial de convergencia

Panel: `revisor-cinico`, `auditor-spec-theater`, `revisor-rbac-seguridad`, `revisor-front-a11y-ux`.
Criterio de avance: **0 BLOQUEANTES** (Constitution XIII). Política: *0 bloqueantes es el suelo; no diferir
ALTAs en silencio.*

| Ronda | Bloqueantes | Altas | Medias | Veredicto | Nota |
|-------|-------------|-------|--------|-----------|------|
| **1** | **5** | 8 | 14 | BLOQUEADA | 2 bloq. confirmados contra contrato (paginación inexistente; CSRF no cubierto). Un error del autor (clarificación Q3). |
| **2** | **0** | 6 | 7 | PASA (suelo) | Todos los bloq./altas de r1 resueltos. Nuevos: ciclo de sesión (retry, cambio de rol, race logout) + a11y (foco ruta, live-region, estilos inline) + bfcache. |
| **3** | **0** | 7 | 5 | PASA (suelo) | Todos los de r2 resueltos. Nuevos cada vez más finos (retry multi-petición, descarte in-flight en cambio de rol, blanqueo síncrono bfcache, 3er vector de estilo, disyunción EARS). |
| **4 (remediación)** | — | — | — | aplicada | Correcciones de las altas de r3 en FR-004/011/017/023/024/025/029/030 + skip-link en design-system §6. **Sin re-correr** (ver decisión). |

## Bloqueantes de la ronda 1 (resueltos)

- **B-01** getOrderList sin paginación (contrato) → FR-010/Q3 corregidos (lista completa, sin cursor).
- **B-02** CSRF double-submit no cubierto → FR-022.
- **B-03** purga de estado cliente al logout → FR-005.
- **B-04** foco/anuncio de ruta SPA → FR-024.
- **B-05** gate determinista de estilos sueltos → FR-017 + SC-008.

## Estado tras ronda 4

**0 bloqueantes sostenido (rondas 2-3).** Todas las ALTAs hasta la ronda 3 están remediadas. Los FR crecieron
de 20 a ~32 (detalle, no alcance: el slice sigue siendo shell + login + listado + detalle read-only, XV).

## Lectura de convergencia (diminishing returns)

El **core** convergió (5 bloq → 0 → 0). Cada ronda el panel imagina edge cases nuevos de menor severidad; los
residuales de la ronda 3 (y previsibles de la 4) son **detalle de implementación** que corresponde a
`/speckit-plan` y que **G2 (consistencia) y G3 (implementación)** volverán a verificar sobre código real:
exhaustividad tipada del mapa de estados, tercer vector de lint, re-expansión de breakpoint, skip-link en
inventario, etc. Seguir iterando el gate de *spec* sobre estos tiene rendimiento decreciente.

**Recomendación**: cerrar G1 (0 bloqueantes, ALTAs de r1-r3 remediadas) y avanzar a `/speckit-plan`, llevando
los refinamientos de implementación como entrada del plan. Alternativa: una ronda 4 de verificación acotada
a "solo bloqueantes o ALTAs que bloqueen la *spec* (no detalle de plan)".
