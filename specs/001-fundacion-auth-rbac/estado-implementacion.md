# Estado de implementación — 001 Fundación Auth/Sesión/RBAC

> Nota de handoff para **retomar el `/speckit-implement` en una sesión nueva** (contexto limpio = mucho
> menos coste de tokens). Actualizada: 2026-07-11. Rama: `001-fundacion-auth-rbac`.

## Contexto de entorno (IMPORTANTE)

- **No hay Node en el host**, pero **sí Docker**. Todo el TDD se ejecuta **dentro de contenedores `node:20`**.
- Runner: **`scripts/dcnode.sh`** — corre cualquier comando node/npm/vitest en `node:20`, monta `backend/`
  y se une a la red de compose (`proyecto-final_default`) para alcanzar Postgres (`db-test:5432`).
- Aviso benigno: la imagen `node:20` corre bajo emulación (amd64 en host arm64); funciona, algo más lento.
  `node_modules` (con argon2 nativo) ya está compilado para amd64 — **no cambiar `--platform`** o argon2 romperá.

## Cómo retomar (sesión nueva)

```bash
cd ~/Documents/proyecto-final
git checkout 001-fundacion-auth-rbac
docker compose up -d db db-test          # Postgres dev + test
bash scripts/dcnode.sh npm install       # solo si node_modules no está
bash scripts/dcnode.sh npx vitest run tests/unit/config.spec.ts   # smoke: debe dar 3/3 verde
# luego: /speckit-implement  (continúa desde T008)
```

Test de una carpeta: `bash scripts/dcnode.sh npx vitest run tests/unit`
Todos: `bash scripts/dcnode.sh npm run test`

## Hecho ✅

- **Phase 1 Setup (T001–T007)**: toolchain, docker-compose, Makefile, `.env.example`, eslint/vitest/tsconfig.
- **T015 + T019 (config fail-fast)**: primer ciclo TDD completo **Red→Green** (3/3 verde), commiteado.
  - `backend/src/infra/config.ts` + `backend/tests/unit/config.spec.ts`.
- Toolchain Docker probado de punta a punta (Postgres + npm install + vitest real).

## Pendiente (orden recomendado: Foundational → US1 → US3 → US2 → Polish)

- **Foundational restante**: T008–T014 (contrato/tipos, Zod, puertos, Result+errores, Prisma schema+migración, seed),
  T016–T018 (Red: headers, correlation-id, ops), T020–T024, T025–T026 (authenticate + SessionState).
- **US1 (MVP, T027–T041)**: login/logout/me + lockout. Tests Red T027–T032 antes de impl.
- **US3 (T042–T047)**: RBAC 401/403/404 + rbacProbe.
- **US2 (T048–T056)**: refresh rotación single-use + gracia + reuso + CSRF.
- **Polish (T057–T066)**: perf P95, anti-enumeración timing, arquitectura, restart/cache, STRIDE, quickstart, DI/wiring.

## Disciplina (Constitution VII)

- **Commit del test en rojo ANTES** del de implementación (verificable en historial). Ya aplicado en T015/T019.
- Dominio (`src/domain/`) **no importa** express/prisma/jsonwebtoken (test de arquitectura T059).
- Contract-first: contract tests por operationId×código desde `contracts/auth.openapi.yaml`.
- 0 bloqueantes de gate para avanzar; ALTA/MEDIA → `docs/backlog.md`.

## Al terminar

- Hook `after_implement` → **G3** (`speckit.gate.run`): panel acumulativo G1+G2 + `revisor-implementacion`.
- Deuda de ramas pendiente: **BL-034** (consolidación limpia) y **push** a `origin` (aún NO hecho, por decisión del usuario).
