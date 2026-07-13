# Quickstart / Validación: Registro de ejecución (005)

Guía de validación **end-to-end** de la feature. Detalles de contrato en
[`../../contracts/orders.openapi.yaml`](../../contracts/orders.openapi.yaml) (operations `startOrderWork`,
`submitOrderExecution`); modelo en [`data-model.md`](./data-model.md).

## Prerequisitos

- Docker Compose arriba (Postgres 16; BD de test `fieldops_test` en `db-test`, puerto 5433, tmpfs).
- Migración aditiva aplicada (`order_evidence`, `order_execution_notes`).
- Seed con al menos: 1 technician T (dueño), 1 technician T2, 1 dispatcher; órdenes en `assigned` y
  `in_progress` de T.

## Comandos

```bash
cd backend
docker compose up -d db-test
npx prisma migrate deploy           # aplica la migración aditiva
npm run test:unit                   # dominio puro (sin BD): validación evidencia/notas, precedencia
npm run test:contract               # startOrderWork / submitOrderExecution × cada código
npm run test:integration            # BD real: transición + evidencia + notas atómicas
```

## Escenarios que deben pasar (mapa a SC)

| # | Acción | Esperado | SC |
|---|---|---|---|
| 1 | T `POST /v1/orders/{id}/start` sobre orden `assigned` suya | 200, `in_progress`, version+1, 1 auditoría | SC-001 |
| 2 | T `POST /v1/orders/{id}/execution` (in_progress suya, 1 evidencia válida + notas) | 200, `pending_review`, version+1, 1 auditoría (reason opaco), 1 fila notas, ≥1 evidencia | SC-002 |
| 3 | Sin token → 401; dispatcher → 403; orden de T2 (cualquier estado) → 404; orden propia mal estado → 422 | precedencia `401→403→404→422` | SC-003 |
| 4 | execution sin evidencia (0) → 422 `EVIDENCE_REQUIRED`; content_type/size/object_ref/duplicado/>10 → 422 `INVALID_EVIDENCE` | sin efecto (no transiciona) | SC-004 |
| 5 | execution con notas ausentes/vacías/>2000 → 422 `VALIDATION_ERROR` | sin efecto | SC-005 |
| 6 | Forzar fallo de evidencia/auditoría/**notas** en la tx | orden NO transiciona; 0 filas nuevas de ese intento | SC-006 |
| 7 | Registrar con notas y `object_ref` centinela; `grep` en logs y cuerpo de error | el valor **no aparece**; en logs sólo id/conteo | SC-007 |
| 8 | Forzar error de BD | 500 genérico sin SQLSTATE/constraint/columna/query | SC-008 |
| 9 | p95 happy path (50 req secuenciales, BD caliente, nearest-rank) | < 300 ms; correlation-ID en respuesta y logs | SC-009 |

## Comprobaciones de arquitectura/seguridad

- **Arch test**: `status`/`version` sólo se escriben desde `domain/order/write-side/` (extendido a la nueva
  ruta de ejecución).
- **No-fuga PII**: `OrderAudit.reason` = `"execution_registered"` (nunca el texto de notas); `object_ref`/notas
  ausentes de logs y cuerpos de error (grep negativo, SC-007).
- **Atomicidad**: prueba de rollback con fallo inyectado en cada paso (incl. notas).
