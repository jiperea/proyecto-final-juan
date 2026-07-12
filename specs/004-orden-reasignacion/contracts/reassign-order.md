# Contrato — reassignOrder (referencia)

> La **fuente de verdad** del contrato es el repo-root `contracts/orders.openapi.yaml` (OpenAPI 3.1,
> contract-first, Constitution II). Este fichero es sólo un puntero/resumen para la trazabilidad del spec.

## Operación

`POST /v1/orders/{orderId}/reassignments` — `operationId: reassignOrder` — rol **dispatcher**.

- **Request** (`ReassignmentRequest`): `{ assignee_id: uuid, reason: string(1..500, ≥1 imprimible) }`.
  `.strict()` → `additionalProperties: false`. El **actor NO va en el cuerpo** (se deriva del token, FR-011).
- **Header opcional**: `If-Match: "<version>"` (stretch, US2/FR-012). Sin él, el servidor relee la version.
- **Respuestas**:
  | HTTP | Código de dominio | Cuándo |
  |------|-------------------|--------|
  | 200 | — | reasignación aplicada; `ETag` con nueva version; body = `Order` |
  | 401 | `UNAUTHENTICATED` | sin auth válida |
  | 403 | `FORBIDDEN` (rol ≠ dispatcher) | autenticado, rol no autorizado |
  | 404 | genérico (inexistente / no reasignable) | no-enumeración por construcción (byte-idéntico) |
  | 409 | `VERSION_CONFLICT` | reasignación concurrente, orden aún reasignable; `ETag` version vigente |
  | 422 | `INVALID_ASSIGNEE` \| `VALIDATION_ERROR` | destino inválido (4 causas, cuerpo idéntico) / reason inválido |
  | 500 | genérico | error de BD ≠ FK-asignatario, sin filtrar detalle Postgres |

- **Cuerpo de error**: `{ code, message, details?, agent_action }` (se extiende `sendError` para emitir
  `agent_action`, D-08). `reason` y detalle de Postgres **nunca** en el cuerpo de error.

## Contract tests (100% operationId × código)

`backend/tests/contract/reassign.contract.spec.ts`: valida la **forma** exacta (status, headers `ETag`, keys
del body, `additionalProperties:false`) de cada respuesta documentada. Ver quickstart para el flujo.
