# Quickstart — 001 Fundación Auth/Sesión/RBAC

> Cómo levantar y ejercitar el slice (el código llega en `/speckit-implement`). Reproducible en máquina
> limpia (Constitution §Empaquetado).

## Requisitos

- Docker + Docker Compose (PostgreSQL 16). Node.js 18+ y npm.

## Arranque

```bash
cp .env.example .env     # JWT_SECRET, CSRF_HMAC_SECRET (≠JWT), DATABASE_URL, ACCESS_TTL=900,
                         # REFRESH_TTL_DAYS=7, GRACE_MS=10000, LOCKOUT_MAX=5, LOCKOUT_WINDOW_MIN=15
make up                  # docker compose (db) + migraciones Prisma + seed
make install
make test                # unit (sin BD) + integration (BD real) + contract (OpenAPI)
```

> Config inválida/incompleta → el servicio **no arranca** y nombra la variable (FR-016/SC-006).

## Usuarios y fixtures semilla

| identifier | rol | uso |
|---|---|---|
| `dispatcher@fieldops.test` / `disp` | dispatcher | probe en alcance → 200 |
| `tech@fieldops.test` / `tech` | technician | probe → 403 (rol nunca puede) |
| `sup@fieldops.test` / `sup` | supervisor | probe en alcance → 200 |

Fixtures `ProbeResource`: ≥1 id "en alcance" (dispatcher/supervisor → 200) + un id inexistente (→ 404).
Contraseñas semilla ≥12 chars (argon2id).

## Flujo manual (curl)

```bash
# Login → access en el cuerpo; refresh_token + csrf_token en cookies
curl -sc cookies.txt -X POST localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"identifier":"dispatcher@fieldops.test","password":"<seed>"}'

# me (Bearer)
curl -s localhost:3000/v1/auth/me -H "authorization: Bearer $ACCESS"

# refresh → rota refresh + csrf (double-submit)
curl -sb cookies.txt -X POST localhost:3000/v1/auth/refresh -H "x-csrf-token: $CSRF"

# logout → 204 (2º logout con misma cookie → 401; no idempotente)
curl -sb cookies.txt -X POST localhost:3000/v1/auth/logout -H "x-csrf-token: $CSRF"
```

## Verificaciones (mapa a SC/FR)

| Comprobación | Espera | Fuente |
|---|---|---|
| Login válido | 200 + sesión, P95<1 s | SC-001, FR-001 |
| Login inválido | 401 uniforme | FR-002 |
| 5 fallos/15 min | 429 uniforme; reset al expirar | SC-004, FR-011 |
| Inexistente vs inválido | Δtiming <50 ms (server-side, N≥200) | FR-011, D9 |
| Recurso sin auth | 401 (antes que CSRF) | FR-007/018 |
| CSRF inválido con sesión | 403 | FR-012/018 |
| technician → probe | 403 (rol antes que pertenencia) | FR-017/017b |
| dispatcher/supervisor → probe ajeno | 404 | FR-017/017b |
| refresh revocado/reuso | 401 + familia revocada | FR-004b/005 |
| refresh reintento ≤10 s | mismo par (no revoca) | FR-004d |
| 2º logout misma cookie | 401 (no idempotente) | FR-003/018 |
| Cuenta disabled | corta refresh (401); locked_until solo login | FR-004c |
| Fallback BD caído | fail-closed 401/503 | D3 |
| auth P95 | <300 ms (server-side) | SC-005, D9 |
| Config inválida | no arranca, nombra variable | SC-006, FR-016 |
| Cabeceras seguridad | HSTS/CSP/X-CTO/X-Frame/Referrer | FR-012 |
| correlation-id | en logs, sin PII ni tokens | FR-014 |
| /health, /ready | 200 / (200\|503) | FR-015 |

## Notas

- Access en memoria (no localStorage); refresh HttpOnly. CSRF solo en `refresh`/`logout`.
- Recurso de dominio real (Order) y "ver mis órdenes" llegan en **002**; aquí `rbac/probe` es el doble de
  prueba del middleware con fixture de pertenencia.
