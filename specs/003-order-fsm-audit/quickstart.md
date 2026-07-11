# Quickstart — 002b Order FSM + auditoría append-only

> Dominio puro (sin endpoint). Verificación por tests dominio+repositorio contra Postgres real (Docker).

```bash
cd ~/Documents/proyecto-final
git checkout 003-order-fsm-audit
docker compose up -d db db-test
bash scripts/dcnode.sh sh -c "npx prisma migrate deploy && npx tsx prisma/seed.ts"   # incluye OrderAudit + REVOKE
bash scripts/dcnode.sh npm run test
```

## Verificación (SC)

- FSM: `isLegalTransition` — todas las legales true, el resto false (unit).
- `applyTransition` (integración, Postgres real):
  - legal → `status` cambia, `version`+1, 1 fila de auditoría (misma transacción).
  - ilegal → `INVALID_TRANSITION` (422), sin efecto.
  - `expectedVersion` obsoleta → `VERSION_CONFLICT` (409), sin efecto.
  - `orderId` inexistente → `ORDER_NOT_FOUND` (404).
  - **atomicidad**: `actor_id` inexistente → rollback (status/version intactos, 0 auditoría) — SC-004.
  - **append-only**: `UPDATE`/`DELETE` sobre `order_audit` → error de BD — SC-003.
  - **concurrencia**: dos `applyTransition` concurrentes → como máximo una gana, una auditoría — SC-002.
  - **guarda de pertenencia**: con `guard.assignedTo` que no coincide → 0 filas (no transiciona).
- Arquitectura: `domain/order` sin infra; `status`/`version` sólo se escriben en el repo de transición.
