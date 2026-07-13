# Data Model (cliente) — FE-1

FE-1 **no define entidades de persistencia** (no hay BD en cliente). Este documento fija los **view-models**
derivados del contrato (por codegen, R-04), el **estado de sesión** en memoria y las **claves de caché** de
TanStack Query. Todo tipo proviene de `contracts/*.openapi.yaml`; nada se redefine a mano.

## 1. View-models (derivados del contrato)

### `SessionUser` (de `auth` · `me`)
| Campo | Tipo | Notas |
|-------|------|-------|
| `userId` | uuid | identidad |
| `name` | string | nombre a mostrar |
| `role` | `'technician' \| 'dispatcher' \| 'supervisor'` | enum del contrato; dirige RBAC espejo y layout |

- Access token: **solo en memoria** (no en el view-model persistible). refresh + `csrf_token`: cookies.

### `OrderSummary` (de `orders` · `listOrders` → schema `Order`)
Conjunto **cerrado** (idéntico para todos los roles; el RBAC filtra **qué órdenes**, no qué campos):
`id` (uuid), `title` (string), `description` (string), `status` (`OrderStatus`), `assigned_to` (uuid | null,
UUID opaco sin PII), `version` (int), `created_at`, `updated_at` (date-time). `draft`/`closed` nunca aparecen.

### `OrderDetail` (de `orders` · `getOrderDetail` → schema `OrderDetailResponse`)
- `order`: `OrderSummary` (mismo `Order`).
- **Campos opcionales** (el backend los **omite**, nunca `null`, según rol/estado):
  - `notes`: string — solo technician dueño / supervisor. **Render escapado** (FR-011b).
  - `evidence`: `{ count: int, content_types: string[] }` — solo technician dueño / supervisor; puede venir
    `{count:0, content_types:[]}` (sin ciclo aún).
  - `last_rejection_reason`: string (saneado, fail-closed) — solo technician **dueño actual** con rechazo sin
    atender.
- Regla de render: **estrictamente por presencia** (FR-011); la UI nunca fabrica ni infiere estos campos.

### `OrderStatus` (enum del contrato)
`assigned | in_progress | pending_review | closed | draft`. Mapa `status → { etiqueta_es, tokens_color }` en
`ui/StatusBadge` con `satisfies Record<OrderStatus, …>` (falla en compilación si falta un estado; FR-007).

### `ApiError` (de `{code,message,details,agent_action}`)
`code` (string) → mensaje español por tabla `docs/design-system.md §8`; `code` no mapeado o sin `code` →
**fallback** «Ha ocurrido un error. Reinténtalo.»; sin respuesta HTTP → «Sin conexión. Reinténtalo.» (FR-015/027).

## 2. Estado de sesión (en memoria)

| Estado | Contenido | Ciclo de vida |
|--------|-----------|---------------|
| `accessToken` | string en memoria (nunca storage) | set en login/refresh; **purga** en logout/cambio de rol/relogin |
| `session` | `SessionUser \| null` | de `me`; re-leído si el refresh cambia el rol (FR-029) |
| `bootStatus` | `loading \| authenticated \| anonymous` | resuelto por el refresh silencioso al arrancar (FR-023) |
| `pendingRoute` | ruta destino tras login | **memoria/estado de router**, nunca storage compartido (FR-004/021/023) |
| `refreshPromise` | promesa compartida de refresh en curso \| null | dedup del 401 (FR-004); una sola a la vez |

**Transiciones clave**: `anonymous → authenticated` (login o refresh silencioso ok); `authenticated → anonymous`
(logout, o refresh fallido, o 401 tras reintento); **cambio de rol** (refresh con `role` distinto) → purga de
caché + re-montaje del shell (FR-029).

## 3. Claves de caché (TanStack Query)

| Query key | Fuente | Invalidación |
|-----------|--------|--------------|
| `['me']` | `me` | logout / cambio de rol |
| `['orders', role]` | `listOrders` | refetch-on-mount + «Actualizar» (FR-009b); purga en logout/cambio de rol |
| `['order', orderId]` | `getOrderDetail` | refetch-on-mount + «Actualizar» (FR-011); purga en logout/cambio de rol |

- **Purga total** de la caché (`queryClient.clear()`) en logout (FR-005) y en cambio de rol (FR-029), antes de
  re-montar el shell, para no filtrar datos entre usuarios/roles en dispositivo compartido.
