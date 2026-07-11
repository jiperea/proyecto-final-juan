# Estado de implementación — 001 Fundación Auth/Sesión/RBAC

> Actualizada: 2026-07-11. Rama: `001-fundacion-auth-rbac`. **Estado: IMPLEMENTADA · G3 APROBADA.**

## Resumen

Las 3 historias (US1 login/logout/me, US3 RBAC, US2 refresh) + fundación + cross-cutting **implementadas
con TDD real** y verificadas contra Postgres real: **110 tests verde** (unit + integration + contract),
typecheck estricto, eslint limpio, cobertura por capa OK, test de arquitectura hexagonal.

**Gate G3 (panel adversarial de 5 revisores): APROBADA, 0 BLOQUEANTES** (ver `gates/gate-G3-...md`).
El panel encontró 6 bloqueantes + S-001 pese a los tests en verde (orden CSRF 401→403 incl. disabled,
TOCTOU de rotación, login fail-closed, y 3 tests spec-theater); **todos cerrados por el bucle SDD**
(research/plan/tasks → código → tests → re-gate).

## Entorno (recordatorio)

- No hay Node en el host; todo corre en Docker vía `scripts/dcnode.sh` (contenedor `node:20` **arm64
  nativo** + Postgres de `docker-compose`, red `proyecto-final_default`, BD de test `db-test`).
- Reanudar/validar: `docker compose up -d db db-test` y `make test` (o `bash scripts/dcnode.sh npx vitest run --no-file-parallelism`).
  Si `node_modules` no está: `make install`. Provisionar BD test: `make up`.

## Pendiente (no bloqueante)

- **Perf/anti-timing** (T057/T058, BL-038): P95 SC-001/SC-005 + |P95|<50ms — verificación de CI/manual.
- **Restart/cache e2e** (T060/T061, BL-035/036): fail-closed handlers, timeout BD, durabilidad lockout.
- **STRIDE↔test + quickstart e2e** (T065/T066).
- Otras MEDIA/BAJA: BL-039..045 (traza forense, CSRF_HMAC sin usar, carrera refresh, validador↔refresh…).
- **BL-034**: consolidación fundación→`main` + re-base 001 (gobernanza). **Push a `origin` aún NO hecho.**

## Merge

001 cumple el criterio de gate (G3 0 bloqueantes). Lista para merge cuando se decida (tras BL-034 / push).
