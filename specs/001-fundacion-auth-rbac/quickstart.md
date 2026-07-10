# Quickstart — 001 Fundación Auth/Sesión/RBAC

> Cómo levantar y ejercitar el slice de auth una vez implementado (Phase 1 doc; el código llega en
> `/speckit-implement`). Reproducible en máquina limpia (Constitution §Empaquetado).

## Requisitos

- Docker + Docker Compose (PostgreSQL 16 en contenedor; paridad de entornos).
- Node.js 18+ y npm.

## Arranque

```bash
# 1. Variables de entorno (fail-fast valida al arrancar — FR-016)
cp .env.example .env            # incluye JWT_SECRET, DATABASE_URL, TTLs, lockout...

# 2. Levantar BD + servicio
make up                         # docker compose up -d db && migraciones Prisma + seed

# 3. Instalar y probar (máquina limpia)
make install
make test                       # unit (sin BD) + integration (BD real) + contract (OpenAPI)
```

> Si falta/está mal una variable, el servicio **no arranca** y nombra la variable (FR-016/SC-006).

## Usuarios semilla (no hay auto-registro)

| identifier | rol | uso |
|---|---|---|
| `dispatcher@fieldops.test` / `disp` | dispatcher | reasignación (features 002+) |
| `tech@fieldops.test` / `tech` | technician | ejecución (004+) |
| `sup@fieldops.test` / `sup` | supervisor | revisión (005+) |

Contraseñas semilla ≥ 12 chars (política NIST); definidas en el seed.

## Flujo manual (curl)

```bash
# Login → access_token en el cuerpo; refresh_token + csrf_token en cookies
curl -sc cookies.txt -X POST localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"identifier":"dispatcher@fieldops.test","password":"<seed-password>"}'
# → 200 { access_token, token_type:"Bearer", expires_in:900, user:{...} }

# me → identidad y rol (Bearer)
curl -s localhost:3000/v1/auth/me -H "authorization: Bearer $ACCESS"
# → 200 { user:{ id, email, username, role } }

# refresh → rota el refresh (single-use) + CSRF double-submit
curl -sb cookies.txt -X POST localhost:3000/v1/auth/refresh \
  -H "x-csrf-token: $(grep csrf_token cookies.txt | awk '{print $7}')"
# → 200 nuevo access_token; cookie refresh rotada

# logout → 204, revoca solo la sesión actual (idempotente)
curl -sb cookies.txt -X POST localhost:3000/v1/auth/logout -H "x-csrf-token: $CSRF"
```

## Verificaciones clave (mapa a SC/FR)

| Comprobación | Espera | Fuente |
|---|---|---|
| Login válido | 200 + sesión, P95 < 1 s | SC-001, FR-001 |
| Login inválido | 401 uniforme (no revela existencia) | FR-002 |
| 5 fallos / 15 min | cuenta bloqueada, 429 uniforme | SC-004, FR-011 |
| Inexistente vs inválido | diferencia timing < 50 ms P95 | FR-011 |
| Recurso sin auth | 401 | FR-007 |
| Rol sin permiso | 403 | FR-008, FR-017 |
| Recurso ajeno por id | 404 (no revela existencia) | FR-009, FR-017 |
| Refresh revocado/reuso | 401 + familia revocada | FR-004b, FR-005 |
| Reintento refresh (≤10 s) | mismo resultado (no revoca) | FR-004d |
| Auth P95 | < 300 ms (sin round-trip BD en validación) | SC-005, research D3 |
| Config inválida | no arranca, nombra variable | SC-006, FR-016 |
| Cabeceras seguridad | HSTS/CSP/X-CTO/X-Frame/Referrer presentes | FR-012 |
| correlation-id | propagado a logs (sin PII) | FR-014 |
| /health, /ready | 200 / (200|503) | FR-015 |

## Notas

- **Access** en memoria del cliente (no localStorage); **refresh** HttpOnly (no legible por JS). CSRF solo
  aplica a `refresh`/`logout` (endpoints de cookie) — research D1/D2.
- Recurso de dominio real (Order) y "ver mis órdenes" llegan en **002**; aquí `rbac/probe` es el doble de
  prueba del middleware RBAC.
