# Quickstart — 002a Order + listado por rol

> Entorno sin Node en el host → todo en Docker (igual que 001). Reutiliza `scripts/dcnode.sh`.

```bash
cd ~/Documents/proyecto-final
git checkout 002-order-entity-listado
docker compose up -d db db-test
bash scripts/dcnode.sh npm install                # si node_modules no está
bash scripts/dcnode.sh sh -c "npx prisma migrate deploy && npx tsx prisma/seed.ts"  # incluye órdenes
bash scripts/dcnode.sh npm run test               # unit + integration + contract
```

## Demo (US1 — "veo mis órdenes según mi rol")

1. Login como `technician1` (seed de 001) → access token.
2. `GET /v1/orders` con `Authorization: Bearer <access>` → 200 con **solo** sus órdenes activas
   (`assigned`/`in_progress`/`pending_review`); ni ajenas ni sus `closed`/`draft`.
3. Login como `supervisor1` → `GET /v1/orders` → solo `pending_review`.
4. Login como `dispatcher1` → `GET /v1/orders` → solo `assigned`/`in_progress`.
5. Sin token → 401. Rol fuera del allowlist → 403.

## Verificación

- Contract test `listOrders` 200/401 (el 403 default-deny se verifica en `unit/orders-authorize`).
- Integration por rol contra el seed (0 fugas, SC-001/004).
- Test de arquitectura: el handler usa `orderScopeFor(role,userId)` (FR-016); `domain/` no importa infra.
- Perf: P95 < 300 ms sobre ≥30 órdenes (método D9).
