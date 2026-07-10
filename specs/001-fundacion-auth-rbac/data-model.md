# Data Model — 001 Fundación Auth/Sesión/RBAC (Phase 1)

> Entidades, atributos, reglas e invariantes derivadas de la spec (FR/Key Entities) y del research.
> PostgreSQL 16 (Prisma). IDs **UUID v7**; tiempos **UTC/ISO-8601**.
> **Base-ready (Constitution v1.5.1):** admite la tabla de auditoría de accesos denegados por FK **sin
> ALTER destructivo**.

## `User`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID v7 (PK) | Ordenable por tiempo. |
| `email` | string | **Único** (case-insensitive). Espacio de unicidad global (FR-001b). |
| `username` | string | **Único** (case-insensitive). Mismo espacio que `email`. |
| `password_hash` | string | argon2id (D4). Nunca sale del dominio ni se loguea. |
| `role` | enum | `dispatcher | technician | supervisor` (FR-006). Se relee en cada rotación (FR-004). |
| `locked_until` | timestamptz? | Lockout **temporal** (FR-011). Afecta solo al **login**, no a sesiones activas (FR-004c). |
| `disabled_at` | timestamptz? | Bloqueo **administrativo** permanente → corta refresh/validación (FR-004c). |
| `created_at`/`updated_at` | timestamptz | |

- **Unicidad global a nivel de esquema (FR-001b, D11):** NO basta con dos índices únicos por columna (no
  impiden `username(A)==email(B)`). Se garantiza con un **espacio de unicidad único**: cada identidad
  aporta sus identifiers **normalizados** (`identifier_norm` = minúsculas+trim) a una **tabla/índice único
  de identifiers** (o índice único sobre la unión email+username normalizados); inserción **transaccional**
  (evita carrera de altas simultáneas). Un `identifier` resuelve a un único usuario o ninguno.
- **Estados:** `active` = `disabled_at IS NULL AND (locked_until IS NULL OR locked_until < now())`.

## `Session` (familia de refresh)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` (`sid`) | UUID v7 (PK) | **Familia**; claim `sid` del access. |
| `user_id` | UUID v7 (FK→User) | |
| `device_label` | string? | Informativo (binding fuerte = BL-008). |
| `created_at` | timestamptz | |
| `revoked_at` | timestamptz? | `null`=vigente; set en logout (esta sesión) o revocación de familia (FR-004b). **Durable** → sobrevive reinicios (D3). |

- Varias sesiones vigentes por usuario (concurrentes, FR-003b). Logout revoca **solo** la sesión actual
  (FR-003); FR-004b revoca **solo la familia comprometida** (ese `sid`), **no** las demás sesiones del usuario.

## `RefreshToken` (rotación single-use)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID v7 (PK) | |
| `session_id` (`sid`) | UUID v7 (FK→Session) | |
| `token_hash` | string | **SHA-256** del token opaco (nunca en claro en BD). |
| `expires_at` | timestamptz | TTL refresh (7 días). |
| `rotated_at` | timestamptz? | Set al rotar (single-use). |
| `replaced_by` | UUID? (FK→RefreshToken) | Sucesor (traza de rotación). |
| `created_at` | timestamptz | |

> **Retención (D12):** los refresh **rotados** se conservan (hash + `sid`) hasta el **TTL** (7 días), no se
> purgan al rotar, para que un `logout` con un token rotado tardío pueda resolver el `sid` (kill-switch) y,
> si está fuera de gracia, disparar FR-004b.

**Invariantes:**
- Rotación **single-use atómica** (FR-004/H-006/H-001) **que además exige sesión no revocada**:
  `UPDATE RefreshToken SET rotated_at=now(), replaced_by=? WHERE id=? AND rotated_at IS NULL AND EXISTS
  (SELECT 1 FROM Session s WHERE s.id=session_id AND s.revoked_at IS NULL)` — una sola petición concurrente
  gana (filas=1) y no emite tokens si un `logout` concurrente ya revocó la sesión (cierra TOCTOU).
- **Reuso fuera de gracia** (token con `rotated_at`, >10 s) → **revoca familia** + `add(sid)` al set de
  revocación en memoria (FR-004b).
- **Reintento dentro de gracia** (≤10 s inclusive, o la petición perdedora de la carrera) → devuelve el
  sucesor desde la **caché de gracia** (idempotente), sin revocar (FR-004d).

## `LoginAttempt` (lockout / anti-enumeración) — store lógico

| Campo | Tipo | Reglas |
|---|---|---|
| `key` | string | `user_id` resuelto **o** **HMAC-SHA256(identifier normalizado, `LOCKOUT_HMAC_SECRET`)** si no resuelto — secreto dedicado ≠ JWT_SECRET/CSRF_HMAC_SECRET (D7/S-002). Los intentos contra cuenta `disabled` también cuentan (FR-002b). |
| `window_start` | timestamptz | Ventana fija 15 min; se resetea al caducar o tras expirar el bloqueo (FR-011). |
| `count` | int | Fallos en la ventana. |
| `locked_until` | timestamptz? | Set al superar el umbral (5). No se extiende durante el bloqueo. |

> Puerto `RateLimitPort`, adaptador **in-memory** (slice). Atomicidad ante concurrencia → BL-020;
> Redis multi-instancia → BL-018.

## Caché de revocación (session-state) — en memoria, no persistida

Soporta D3/FR-004b/004c. **Ambas** condiciones en la misma caché: set de `sid` revocados **por compromiso
confirmado** (FR-004b) + set de usuarios `disabled`. Actualización **write-through síncrona** desde la
petición que la produce; **TTL de seguridad ≤30 s**, **cache-miss → fallback a BD** (consulta
`Session.revoked_at` **y `User.disabled_at`**, ambos durables → sobreviven a reinicio, H-001), **fail-closed**
(401/503) si la BD tampoco responde. **El logout voluntario NO añade el `sid` aquí** (no corta el access
por-request; solo revoca el refresh — invalidación en logout = stretch, FR-003). Puerto `SessionStatePort`
(`isRevoked(sid)`, `isUserActive(sub)`). Es **por-instancia** (slice); multi-instancia → BL-018.

## Caché de gracia de refresh — efímera, en memoria, no persistida

Soporta FR-004d/R2-B1. Mapa `hash(token) → { access_token, refresh_token (claro), **csrf_token**, expira_en }`,
**TTL = ventana de gracia (≤10 s)**. Un reintento de gracia re-sirve el **mismo** trío (access+refresh+csrf)
para no desincronizar el double-submit del cliente (H-005). Re-sirve el mismo par a un reintento legítimo; **no** persiste el token en
claro en BD. Si la entrada se pierde dentro de la gracia (reinicio/eviction) → se responde **401** (re-login),
**no** se revoca familia (evita falso positivo).

## `ProbeResource` (fixture de RBAC — seed, no dominio real)

Soporta FR-017b (200/403/404 deterministas). Fixture de seed, no tabla de dominio.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID v7 (PK) | Id de `GET /v1/rbac/probe/{id}`. |
| `in_scope_roles` | enum[] | Roles para los que el id está "en alcance" → 200. Semilla: `[dispatcher, supervisor]`. |

Regla (orden rol→pertenencia): technician → **403**; dispatcher/supervisor → **200** si `id` existe y su
rol ∈ `in_scope_roles`, **404** si no. **Seed (3 casos deterministas, FR-017b):**
- `probe-A` con `in_scope_roles=[dispatcher, supervisor]` → **200** para ambos.
- `probe-B` con `in_scope_roles=[supervisor]` → **200** supervisor, **404-por-alcance** dispatcher (existe
  pero fuera de su alcance).
- `probe-C` con `in_scope_roles=[dispatcher]` → **200** dispatcher, **404-por-alcance** supervisor
  (cobertura simétrica del 404-por-alcance para ambos roles, H-003).
- un id **inexistente** → **404-por-inexistencia**.

Así los dos caminos de 404 (alcance vs inexistencia) tienen caso propio para dispatcher **y** supervisor, y
technician da 403 en todos.

## Base-ready: `DeniedAccessAudit` *(NO se implementa en 001)*

El esquema admite añadir por FK a `User` **sin** ALTER destructivo: `id`, `actor_id?` (null si 401),
`outcome` (401|403|404), `endpoint`, `resource_ref?` (opaco, no PII), `at`. Se materializa con BL-002.

## Mapa entidad → FR

| Entidad | FRs |
|---|---|
| User | FR-001/001b/002/002b/006/004/004c/011 |
| Session | FR-001/003/003b/004b/004c |
| RefreshToken | FR-004/004b/004d/005 |
| LoginAttempt | FR-011/002b |
| Caché revocación | FR-004b/004c |
| Caché gracia | FR-004d |
| ProbeResource | FR-017/017b |
