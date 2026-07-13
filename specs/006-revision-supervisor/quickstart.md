# Quickstart / Validación: Revisión por el supervisor (006)

Guía de validación **end-to-end**. Contrato en
[`../../contracts/orders.openapi.yaml`](../../contracts/orders.openapi.yaml) (operation `reviewOrder`);
modelo en [`data-model.md`](./data-model.md); decisiones en [`research.md`](./research.md).

## Prerequisitos

- Docker Compose arriba (Postgres 16; BD de test `fieldops_test` en `db-test`, puerto 5433, tmpfs).
- **Sin migración nueva** (006 no cambia el esquema; usa `orders`/`order_audit`/`order_evidence` de 002b/005).
- Seed con al menos: 1 supervisor S, 1 technician T, 1 dispatcher D; órdenes en `pending_review` (con ≥1
  evidencia, vía 005), en `in_progress`, en `assigned` y en `closed`; y (para FR-013) 1 orden en `pending_review`
  **sin** evidencia (estado artificial que rompe la invariante de 005).

## Comandos

```bash
cd backend
docker compose up -d db-test
npm run test:unit                   # dominio puro (sin BD): decision, sanitizeReason, precedencia, estado destino
npm run test:contract               # reviewOrder × cada código (200/401/403/404/409/422/500/503)
npm run test:integration            # BD real: transición + auditoría atómicas; conservación evidencia/notas
```

## Escenarios que deben pasar (mapa a SC/FR)

| # | Acción | Esperado | SC/FR |
|---|---|---|---|
| 1 | S `POST /v1/orders/{id}/review` `{decision:approve}` sobre `pending_review` con evidencia | 200, `closed`, version+1, 1 auditoría `{from:pending_review,to:closed,actor:S}` | SC-001, FR-001/004 |
| 2 | S `{decision:reject, reason:"motivo válido"}` sobre `pending_review` | 200, `in_progress`, version+1, 1 auditoría con `reason` saneado | SC-002, FR-002 |
| 3 | Tras aprobar/rechazar: consultar evidencia y notas de 005 | siguen presentes e inalteradas (0 pérdidas) | SC-004, FR-005 |
| 4 | S `{decision:reject}` sin `reason` / `reason` vacío-tras-saneo / >1000 | 422 `INVALID_REASON`, sin cambio de estado | SC-002, FR-003 |
| 5 | S `{decision:approve, reason:"   "}` (vacío tras saneo) | 422 `INVALID_REASON`, sin efecto | FR-008 |
| 6 | Sin token → 401; T o D → 403; orden inexistente/`orderId` malformado/estado ≠ `pending_review` → 404 genérico | precedencia `401→403→…→404` | SC-003, FR-006/007 |
| 7 | Body sin `decision` / `decision:"aprove"` / body no-JSON | 422 `VALIDATION_ERROR` (antes que INVALID_REASON) | FR-011 |
| 8 | S `{decision:approve}` sobre `pending_review` **sin** evidencia | 409 `EVIDENCE_REQUIRED`, sin efecto | FR-013 |
| 9 | Enviar `actorId` en el body; comprobar auditoría | el actor es el del token (S), se ignora el del body | FR-012 |
| 10 | `reason` centinela; `grep` en logs y cuerpo de error | el valor **no aparece**; en logs sólo id/estado | SC-005, FR-008 |
| 11 | Forzar fallo en la tx (auditoría) | orden NO transiciona; 0 auditorías nuevas de ese intento | SC-005, FR-004 |
| 12 | Forzar error de BD no transitorio → 500; BD no disponible → 503 | cuerpo genérico sin detalle de Postgres | FR-010 |
| 13 | p95 **por separado** approve y reject (50 req secuenciales, BD caliente, nearest-rank) | ambos < 300 ms; correlation-ID en respuesta y logs | SC-006 |

## Comprobaciones de arquitectura/seguridad

- **Arch test**: `status`/`version` sólo se escriben desde `domain/order/write-side/` +
  `order-write-side-repository.ts`; `apply-transition.ts`/`classifyZeroRows` de 002b **no** se invocan desde 006.
- **No-fuga (FR-008)**: grep negativo del `reason` centinela en logs y cuerpos de error.
- **No-enumeración (FR-007)**: 404 de orden ajena de estado/ inexistente es **byte-idéntico** (mismo cuerpo).
- **Atomicidad (FR-004)**: ninguna transición deja auditoría huérfana ni media escritura.
