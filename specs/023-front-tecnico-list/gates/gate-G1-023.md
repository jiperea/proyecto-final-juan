# Gate G1 — 023-front-tecnico-list (FE-9)

**Veredicto: ✅ PASS** (0 bloqueantes). Panel: revisor-cínico · auditor-spec-theater · revisor-rbac-seguridad.

## Resultado
Feature de **presentación** (fidelidad de la lista del técnico + detalle). Nunca hubo bloqueantes; las altas
fueron refinamientos, la mayoría de **especulación mía sobre el contrato** que se corrigió **verificando
`contracts/orders.openapi.yaml`**. Todas resueltas en la spec.

## Convergencia
| Ronda | Total | Bloq | Altas | Hito |
|------|------|------|------|------|
| 1 | 16 | 0 | 5 | «siempre Tú» contradictorio + enmascaraba IDOR (S-001) |
| 2 | 10 | 0 | 5 | Anclado al contrato: `assigned_to` uuid, `notes` presente, `count==content_types.length` (imágenes) |
| 3 | 10 | 0 | 2 | userId del contexto de sesión; UUID truncado |
| 4 | 9 | 0 | 2 | `listOrders` server-scoped (técnico=propias) → «Tú» real; UUID=guarda defensiva |
| 5 | 7 | 0 | 3 | userId en loading → «Sin asignar»; tarjeta compartida (supervisor=UUID asignatario); literal neutro fijado |

## Decisiones/anclajes clave (contra el contrato verificado)
- **Técnico en meta**: «Tú» (userId==assigned_to) · UUID truncado 8 chars (asignatario, sin nombre en contrato) · **«Sin asignar»** (null o sesión cargando). Válido en cualquier vista que reutilice la tarjeta.
- **Sub-línea del detalle eliminada**: el contrato no expone cliente/ubicación (no se inventa).
- **Evidencia**: invariante `count == content_types.length` (1:1) + enum solo imágenes → **N tiles «Imagen N»** 1-based; count=0 → «sin evidencia».
- **Notas**: tarjeta con tokens (surface+border+radius-md+shadow-1), solo si contenido no vacío, escapada.
- **RBAC/PII (S-*)**: listado y detalle **server-authoritative** (scope por rol; 401/403/404); sin nueva superficie de PII; sin cambios de auth (solo lectura de `useSession`).

> Lección: **verificar el contrato antes de especificar comportamiento sobre datos**. Las altas de rondas 1–2
> nacieron de asumir campos/cardinalidades que el contrato ya fijaba. Cerrado en PASS estable (5 rondas, 0 bloq).
