# Quickstart — Validación de 004 (reasignación de orden)

Guía **runnable** para probar que la feature funciona end-to-end contra Postgres real. No contiene código de
implementación (eso vive en `tasks.md` / fase de implementación). Detalles de contrato en
[contracts/reassign-order.md](./contracts/reassign-order.md) y datos en [data-model.md](./data-model.md).

## Prerrequisitos

- Docker + Docker Compose (Postgres 16 de test: servicio `db-test`, puerto host **5433**, DB `fieldops_test`).
- `.env` con `TEST_DATABASE_URL=postgresql://fieldops:fieldops@localhost:5433/fieldops_test` (ver `.env.example`).
- Seed de usuarios (`prisma/seed-data.ts`): dispatcher, technician(s), supervisor con `SEED_PASSWORD`.

## Setup

```bash
# 1) Levantar la BD de test efímera (tmpfs) — patrón scripts/dcnode.sh (como 002b)
docker compose up -d db-test

# 2) Aplicar migraciones (incluye la nueva extend_order_audit_reassignment)
cd backend && npm run prisma:migrate:deploy      # o el script equivalente del repo

# 3) (Opcional) seed
npm run seed
```

## Ejecutar la verificación

```bash
cd backend
npm run test:unit         # dominio (reassign-order) con fakes, sin BD
npm run test:integration  # BD real: RBAC, no-enum, 422, 409, atomicidad, latencia
npm run test:contract     # forma de request/response por código (OpenAPI)
npm run test              # todo + cobertura (gate: dominio ≥80%, handlers/servicios ≥80%)
```

## Escenarios de validación (mapa SC/FR → resultado esperado)

| # | Acción | Esperado | Cubre |
|---|--------|----------|-------|
| 1 | Dispatcher reasigna orden `assigned` (T1→T2) con reason válido | 200, `assigned_to=T2`, `status` intacto, `version`+1, `ETag`, **1** fila auditoría `event_type=reassignment` | SC-001, FR-001/007 |
| 2 | Dispatcher reasigna orden `in_progress` | 200, estado conservado `in_progress` | SC-001, FR-002 |
| 3 | Sin credenciales | 401, sin revelar existencia | SC-002, FR-003 |
| 4 | Technician/supervisor autenticado reasigna | 403 `FORBIDDEN_ROLE`, sin efecto | SC-002, FR-003 |
| 5 | Dispatcher sobre orden `pending_review`/`closed`/`draft` | 404 genérico indistinguible, sin efecto | SC-003, FR-002/004 |
| 6 | Dispatcher sobre `orderId` inexistente vs no-visible | 404 **byte-idéntico** en cuerpo+cabeceras (3 vías, incl. colapso post-UPDATE) | SC-008, FR-004 |
| 7 | Destino inexistente / no-technician / deshabilitado / = actual | 422 `INVALID_ASSIGNEE`, cuerpo genérico idéntico | SC-005, FR-005 |
| 8 | `reason` ausente/vacío/sólo espacios/sólo control / >500 code points | 422 `VALIDATION_ERROR` | FR-006 |
| 9 | 2 reasignaciones concurrentes (misma version) | exactamente 1 → 200; la otra → 409 `VERSION_CONFLICT`; sin doble auditoría | SC-004(a), FR-008 |
| 10 | Reasignación vs transición FSM concurrente que saca la orden de ámbito | 404 (no 409) por precedencia status>version | SC-004(b), FR-008 |
| 11 | Reasignar orden huérfana (`assigned_to=NULL` por `SetNull`) a T2 | 200, `from_assignee=NULL`, `to_assignee=T2` | Edge case, FR-001 |
| 12 | `reason` centinela por el endpoint | ausente en logs (req/resp/error) y en body de error (grep negativo) | SC-006, FR-009 |
| 13 | Forzar error de BD ≠ FK-asignatario | 500 genérico, sin SQLSTATE/constraint/columna/query | SC-007, FR-010 |
| 14 | Fallo de insert de auditoría dentro de la tx | orden intacta (assigned_to/status/version), 0 filas auditoría | SC-009, FR-007 |
| 15 | (Stretch) `If-Match` obsoleto → 409; correcto → 200; fuera de ámbito + If-Match obsoleto → 404 | precedencia respetada | SC-004, FR-012 |
| 16 | Migración | filas de auditoría legacy (002b) quedan `event_type=transition`, par NULL; trigger sigue bloqueando UPDATE/DELETE | H-203, D-05 |
| 17 | p95 de 50 reasignaciones secuenciales (BD caliente, warm-up descartado) | < 300 ms; correlation-ID en respuesta y logs | SC-010 |
| 18 | Test de arquitectura | ningún fichero fuera de `domain/order/write-side/*` (ni del repo write-side) muta `status`/`version` | FR-007, BL-065 |

## Notas

- Login para obtener token: `POST /v1/auth/login` con `SEED_USERS.dispatcher` → `Authorization: Bearer <access_token>`
  (patrón de `tests/contract/orders.contract.spec.ts`).
- BD de test efímera (`tmpfs`): cada corrida parte limpia; usar `makeOrder(prisma, {status, assignedTo, version})`
  de `tests/helpers/transition.ts` para fixtures (incl. orden huérfana con `assignedTo: null`).
- `down.sql` de la migración no lo ejecuta Prisma automáticamente (documentado como en 002b).
