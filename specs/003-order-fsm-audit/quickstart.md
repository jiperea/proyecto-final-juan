# Quickstart — 002b Order FSM + auditoría append-only

> Dominio puro (sin endpoint). Verificación por tests dominio+repositorio contra Postgres real (Docker).

```bash
cd ~/Documents/proyecto-final
git checkout 003-order-fsm-audit
docker compose up -d db db-test
bash scripts/dcnode.sh sh -c "npx prisma migrate deploy && npx tsx prisma/seed.ts"   # incluye OrderAudit + TRIGGER append-only
bash scripts/dcnode.sh npm run test
```

## Verificación (SC)

- FSM: `isLegalTransition` — todas las legales true, el resto false (unit).
- `applyTransition` (integración, Postgres real):
  - legal → `status` cambia, `version`+1, 1 fila de auditoría (misma transacción).
  - ilegal → `INVALID_TRANSITION` (422), sin efecto.
  - `expectedVersion` obsoleta → `VERSION_CONFLICT` (409), sin efecto.
  - `orderId` inexistente → `ORDER_NOT_FOUND` (404).
  - **atomicidad**: `actor_id` inexistente → rollback (status/version intactos, 0 auditoría) + resultado
    `ACTOR_INVALID` sin filtrar error crudo de BD — SC-004.
  - **append-only**: `UPDATE`/`DELETE` sobre `order_audit` (con el rol de runtime) → error de BD por el
    TRIGGER — SC-003.
  - **concurrencia**: dos `applyTransition` con la misma `expectedVersion` (`Promise.all`) → exactamente una
    gana, una auditoría, la otra `VERSION_CONFLICT`; + caso secuencial determinista — SC-002.
  - **guarda de pertenencia**: `guard.assignedTo` que no coincide → 0 filas → `GUARD_UNMET` (no transiciona,
    no audita); + TOCTOU determinista secuencial — SC-005.
  - **no-fuga de `reason`**: error con `reason` centinela → no aparece en logs ni en el error serializado — SC-006.
- Arquitectura: `domain/order` sin infra; `status`/`version` sólo se escriben en el repo de transición.
