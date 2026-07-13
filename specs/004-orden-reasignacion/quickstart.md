# Quickstart — Validación de 004 (reasignación de orden, MVP magro)

Guía runnable para probar la feature end-to-end contra Postgres real. Detalles de contrato en
[contracts/reassign-order.md](./contracts/reassign-order.md); datos en [data-model.md](./data-model.md).

## Prerrequisitos

- Docker + Compose (Postgres 16 de test: `db-test`, puerto host 5433, DB `fieldops_test`, tmpfs).
- `.env` con `TEST_DATABASE_URL=postgresql://fieldops:fieldops@localhost:5433/fieldops_test`.
- Seed de usuarios (dispatcher, technicians, supervisor) con `SEED_PASSWORD`.

## Setup

```bash
docker compose up -d db-test
cd backend && npm run prisma:migrate:deploy   # incluye extend_order_audit_reassignment
npm run seed
```

## Ejecutar verificación

```bash
cd backend
npm run test:unit         # dominio (reassign-order) con fakes, sin BD
npm run test:integration  # BD real: RBAC, no-enum, 422, atomicidad, concurrencia
npm run test:contract     # forma de request/response por código (OpenAPI)
npm run test              # todo + cobertura (dominio ≥80%, handlers/servicios ≥80%)
```

## Escenarios de validación (SC/FR → esperado)

| # | Acción | Esperado | Cubre |
|---|--------|----------|-------|
| 1 | Dispatcher reasigna orden `assigned` (T1→T2) con reason | 200, `assigned_to=T2`, estado intacto, `version`+1, 1 auditoría `reassignment` (`from_assignee=T1`, `to_assignee=T2`, `from_status/to_status=NULL`) | SC-001, FR-001/007 |
| 2 | Dispatcher reasigna orden `in_progress` | 200, estado conservado | SC-001, FR-002 |
| 3 | Sin credenciales / token expirado / sesión revocada | 401 | SC-002, FR-003 |
| 4 | Technician/supervisor reasigna | 403 `FORBIDDEN_ROLE` | SC-002, FR-003 |
| 5 | Dispatcher sobre `pending_review`/`closed`/`draft` | 404 genérico | SC-003, FR-002 |
| 6 | `orderId` inexistente / no visible / **malformado (no-uuid)** | 404 genérico **idéntico** (mismo cuerpo) | SC-004, FR-004 |
| 7 | Sin auth **+** `orderId` malformado | **401** (auth precede a la validación de forma) | FR-004 |
| 8 | Destino inexistente / no-technician / deshabilitado / = actual | 422 `INVALID_ASSIGNEE`, cuerpo genérico idéntico | SC-005, FR-005 |
| 9 | `reason` ausente/vacío/whitespace/control / >500 code points; o `assignee_id` ausente/no-uuid | 422 `VALIDATION_ERROR` | SC-006, FR-006 |
| 10 | Orden **no visible** + body inválido | **404** (no 422): visibilidad precede a forma del body | FR-004 |
| 11 | Reasignar orden huérfana (`assigned_to=NULL`) a T2 | 200, `from_assignee=NULL`, `to_assignee=T2` | Edge, FR-001 |
| 12 | `reason` centinela | ausente en logs y en cuerpo de error (grep negativo) | SC-008, FR-009 |
| 13 | Forzar error de BD | 500 genérico, sin SQLSTATE/constraint/columna/query | SC-009, FR-009 |
| 14 | Fallo del insert de auditoría en la tx | orden intacta, 0 filas auditoría | SC-007, FR-007 |
| 15 | Concurrencia mismo destino (2× T2 sobre `assigned_to=T1`) | exactamente 1 → 200; la otra → 422 (guarda `assigned_to<>destino`), sin auditoría no-op | SC-005, FR-007 |
| 16 | Concurrencia destinos distintos (T1→T2, luego →T3) | last-write-wins; auditoría de la 2ª con `from_assignee` = valor previo real (T2) | SC-001, FR-007 |
| 17 | Carrera con transición FSM que saca la orden de ámbito antes del commit | 404 (0 filas, sin 200/auditoría fantasma) | FR-007 |
| 18 | p95 de 50 reasignaciones secuenciales (BD caliente, warm-up descartado, nearest-rank) | < 300 ms; correlation-ID presente | SC-010 |
| 19 | Migración | filas legacy de 002b con `event_type=transition`, par NULL; trigger sigue bloqueando UPDATE/DELETE | data-model |
| 20 | Test de arquitectura | ningún fichero fuera de `domain/order/write-side/*` (+ repo write-side) muta `status`/`version`/`assigned_to` | FR-007 |

## Notas

- Login: `POST /v1/auth/login` con `SEED_USERS.dispatcher` → `Authorization: Bearer <token>`.
- Fixtures con `makeOrder(prisma, {status, assignedTo, version})` (incl. huérfana `assignedTo:null`).
- `down.sql` de la migración no lo ejecuta Prisma automáticamente.
