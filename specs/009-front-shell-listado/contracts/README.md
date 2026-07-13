# Contratos consumidos por FE-1 — mapa de consumo (NO nuevos endpoints)

FE-1 **no introduce ni modifica** ningún endpoint. Consume los contratos ya congelados. Este fichero es el
**mapa de consumo**: qué operaciones usa, con qué códigos, y cómo se derivan los tipos (contract-first en
cliente). El "contract test" de FE-1 son handlers **MSW derivados** de estas operaciones + tests de componente.

## Operaciones consumidas

### `contracts/auth.openapi.yaml`
| operationId | Método/ruta | Uso en FE-1 | Códigos manejados |
|-------------|-------------|-------------|-------------------|
| login | POST `/v1/auth/login` | US1 acceso (FR-001/002) | 200 · 401 (credenciales) · 422 (validación) · 429 (rate-limit) |
| me | GET `/v1/auth/me` | identidad/rol del shell (FR-001/023/029) | 200 · 401 |
| refresh | POST `/v1/auth/refresh` | renovación silenciosa/401, **CSRF double-submit** (FR-004/022/023) | 200 · 401 · 403 (CSRF) · 503 |
| logout | POST `/v1/auth/logout` | cierre de sesión, **CSRF** (FR-005/022) | 204 · 401 · 403 · 503 |

### `contracts/orders.openapi.yaml`
| operationId | Método/ruta | Uso en FE-1 | Códigos manejados |
|-------------|-------------|-------------|-------------------|
| listOrders | GET `/v1/orders` | listado por rol (FR-006..010) — **sin paginación** | 200 · 401 · 403 · 503 |
| getOrderDetail | GET `/v1/orders/{orderId}` | detalle read-only por rol (FR-011..013b) | 200 · 401 · 404 (uniforme) · 500 · 503 |

> `listOrders` responde `OrderListResponse { orders: Order[] }` **sin cursor** (contrato: "Sin paginación").
> `getOrderDetail` responde `OrderDetailResponse { order, notes?, evidence?, last_rejection_reason? }` (opcionales
> omitidos por rol/estado; 404 uniforme sin 403; `last_rejection_reason` solo al technician dueño con rechazo sin
> atender).

## Derivación de tipos (codegen)

- `npm run codegen` → **openapi-typescript** sobre ambos YAML → tipos TS en `frontend/src/api/generated/`.
- Zod de las respuestas consumidas derivado del mismo contrato (validación en el boundary).
- **CI**: regenerar y `git diff --exit-code`; si los tipos comprometidos divergen del contrato, **falla**
  (FR-016 / SC-008b). Ningún tipo/enum de la UI se escribe a mano.
