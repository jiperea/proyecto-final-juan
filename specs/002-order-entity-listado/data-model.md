# Data Model — 002a Order + listado por rol

> Entidad `Order` (read-side) + política de alcance + plan de seed. Reutiliza User de 001. PostgreSQL 16
> (Prisma). IDs UUID v7; tiempos timestamptz (UTC).

## `Order`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID v7 (PK) | Ordenable por tiempo; tiebreak de orden. |
| `title` | string | Texto libre; **posible PII de cliente → nunca en logs** (FR-017). |
| `description` | string | Íd. |
| `status` | enum | `draft \| assigned \| in_progress \| pending_review \| closed`. **Dato** en 002a (sin transiciones). |
| `assigned_to` | UUID? (FK→User) | Nullable. Técnico asignado. **Invariante**: no `assigned`/`in_progress` con null. |
| `version` | int (default 0) | **Concurrencia optimista** — diseñada ahora (Const. v1.5.1); If-Match→409 stretch 003/004. |
| `created_at`/`updated_at` | timestamptz | `created_at` gobierna el orden (desc). |

- **Base-ready 002b** (sin ALTER destructivo): la FSM añadirá lógica de transición sobre `status`+`version`;
  la **tabla de auditoría append-only** referenciará `Order.id` (FK estable). Nada de 002a se reescribe.
- **Prisma**: modelo `Order` (`@@map("orders")`), enum `OrderStatus`, FK opcional a `users`, índice por
  `(status, assigned_to)` para el filtrado y `created_at` para el orden.

## Política de alcance — `orderScopeFor(role, userId)` (dominio, FR-016)

Devuelve `{ assignedToSelf: boolean, statuses: OrderStatus[] }`; el repositorio la traduce a `WHERE`:

| Rol | `assignedToSelf` | `statuses` |
|---|---|---|
| technician | true (`assigned_to == userId`) | `assigned`, `in_progress`, `pending_review` |
| supervisor | false | `pending_review` |
| dispatcher | false | `assigned`, `in_progress` |

- `closed` y `draft` **no** aparecen para ningún rol (fuera de todos los `statuses`).
- Es la **única** fuente de la regla; el handler la invoca (test de arquitectura lo verifica).

## Puerto `OrderRepositoryPort` (dominio)

- `listForScope(scope: OrderScope): Promise<OrderRecord[]>` — aplica el predicado + orden
  `created_at DESC, id DESC`, sin paginación. Devuelve campos públicos.

## Caché / consultas

- Ninguna caché nueva; consulta directa a BD filtrada por el scope. El auth/estado por-request lo cubre
  `authenticate` de 001 (fail-closed).

## Plan de seed (`prisma/seed.ts`, extiende el de 001)

≥30 órdenes. **Requiere ≥2 technicians** (001 solo trae `technician1`): el seed de 002a añade
`technician2` y `technician3`.
- Varias `assigned`/`in_progress` de `technician1` y `technician2` — visibles a su dueño y al dispatcher.
- `pending_review` de `technician1` **y de `technician2`** — el supervisor las ve todas; **`technician1` NO ve
  la de `technician2`** (IDOR mismo-estado, S-002/SC-004).
- **`technician3` sin órdenes activas** (solo alguna `closed`) → prueba **lista vacía → 200** (H-003).
- **≥2 órdenes con `created_at` EXACTAMENTE igual** (mismo instante) → prueba el tiebreak `id` desc (H-001).
- **≥1 `draft` con `assigned_to = null`** (no visible a nadie).
- **≥1 `closed` asignada a `technician1`** (no visible ni a él) — exclusión de propias cerradas.
- **Invariante**: ninguna orden `assigned`/`in_progress`/**`pending_review`** con `assigned_to = null`
  (estados imposibles en la FSM de 002b; H-005).

## Mapa entidad → FR

| Elemento | FRs |
|---|---|
| Order (campos/version) | FR-007/010 |
| orderScopeFor | FR-002/003/004/016 |
| Endpoint/orden/sin-params | FR-001/008/009/012/013/014/015 |
| Errores accionables + correlation-id (reutiliza 001) | FR-011 (regresión 001 + aserción en T008/T010) |
| Seed | SC-001/004 |
