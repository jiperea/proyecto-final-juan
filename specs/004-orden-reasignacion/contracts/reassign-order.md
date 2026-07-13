# Contrato — reassignOrder (referencia)

> Fuente de verdad: repo-root `contracts/orders.openapi.yaml` (OpenAPI 3.1). Este fichero es un puntero para
> la trazabilidad del spec.

## Operación

`POST /v1/orders/{orderId}/reassignments` — `operationId: reassignOrder` — rol **dispatcher**.

- **Request** (`ReassignmentRequest`, `.strict()`): `{ assignee_id: uuid, reason: string(1..500 code points, ≥1
  imprimible, sin control chars) }`. **Sin** campo actor (del token, FR-008). **Sin** cabecera If-Match (MVP).
- **Respuestas**:
  | HTTP | Código | Cuándo |
  |------|--------|--------|
  | 200 | — | reasignación aplicada; body = `Order` (nuevo `assigned_to`, `version`+1) |
  | 401 | `UNAUTHENTICATED` | sin auth / token expirado / sesión revocada (middleware de 001) |
  | 403 | `FORBIDDEN_ROLE` | autenticado, rol ≠ dispatcher |
  | 404 | genérico (`ORDER_NOT_FOUND`) | inexistente / no reasignable / `orderId` malformado — cuerpo idéntico |
  | 422 | `VALIDATION_ERROR` \| `INVALID_ASSIGNEE` | body mal formado (reason/assignee_id) / destino inválido (4 causas, cuerpo genérico idéntico) — **sólo tras pasar la visibilidad** |
  | 500 | genérico | cualquier error de BD, sin filtrar detalle Postgres |
- **Cuerpo de error**: `{ code, message, details?, agent_action }`; `agent_action` en respuestas de negocio
  (404/422/500). `reason` y detalle de Postgres **nunca** en el cuerpo de error.

## Contract tests (100% operationId × código)

`backend/tests/contract/reassign.contract.spec.ts`: valida forma exacta (status, keys del body,
`additionalProperties:false`, `agent_action` en negocio) de 200/401/403/404/422/500.
