# Data Model — 001 Fundación Auth/Sesión/RBAC (Phase 1)

> Entidades, atributos, reglas de validación e invariantes derivadas de la spec (FR/Key Entities) y del
> research. Persistencia: PostgreSQL 16 (Prisma). IDs **UUID v7**; tiempos **UTC/ISO-8601**.
> **Base-ready (Constitution v1.5.1):** el esquema admite añadir la tabla de auditoría de accesos
> denegados por FK **sin ALTER destructivo**.

## Entidad: `User`

| Campo | Tipo | Reglas / Notas |
|---|---|---|
| `id` | UUID v7 (PK) | Identidad estable, ordenable por tiempo. |
| `email` | string | **Único** (case-insensitive). Parte del espacio de unicidad global (FR-001b). |
| `username` | string | **Único** (case-insensitive). Mismo espacio de unicidad que `email`. |
| `password_hash` | string | argon2id (D4). Nunca sale del dominio ni se loguea. |
| `role` | enum | `dispatcher | technician | supervisor` (FR-006). |
| `locked_until` | timestamptz? | Bloqueo **temporal** por lockout; `null` = no bloqueado. Auto-expira (FR-011). |
| `disabled_at` | timestamptz? | Bloqueo **administrativo** permanente (gestión fuera de alcance). |
| `created_at` / `updated_at` | timestamptz | Auditoría técnica. |

**Reglas de unicidad (FR-001b):** email y username comparten un **espacio de unicidad global**: un
`identifier` resuelve a **un único** usuario o a ninguno. Se garantiza con índices únicos + normalización
(lowercase) y una comprobación de que ningún `username` colisiona con un `email` ajeno.

**Estados derivados:**
- `active` = `disabled_at IS NULL AND (locked_until IS NULL OR locked_until < now())`.
- `locked` = `locked_until >= now()` → login/refresh/validación responden según FR-011/FR-004c.
- `disabled` = `disabled_at IS NOT NULL` → 401 en refresh/validación (FR-004c).

## Entidad: `Session` (familia de refresh)

| Campo | Tipo | Reglas / Notas |
|---|---|---|
| `id` (`sid`) | UUID v7 (PK) | **Familia** de sesión; va como claim `sid` en el access token. |
| `user_id` | UUID v7 (FK→User) | Dueño de la sesión. |
| `device_label` | string? | Etiqueta/origen informativo (no binding fuerte; BL-008 stretch). |
| `created_at` | timestamptz | Emisión. |
| `revoked_at` | timestamptz? | `null` = vigente; set en logout (esta sesión) o revocación de familia (FR-004b). |

- Un usuario puede tener **varias** sesiones vigentes (concurrentes, una por dispositivo — FR-003b).
- `logout` revoca **solo** la sesión actual (FR-003). `FR-004b` revoca **todas** las del usuario.

## Entidad: `RefreshToken` (rotación single-use dentro de una familia)

| Campo | Tipo | Reglas / Notas |
|---|---|---|
| `id` | UUID v7 (PK) | |
| `session_id` (`sid`) | UUID v7 (FK→Session) | Familia a la que pertenece. |
| `token_hash` | string | **SHA-256** del token opaco (nunca se guarda el token en claro). |
| `expires_at` | timestamptz | TTL refresh (7 días por defecto). |
| `rotated_at` | timestamptz? | Set al rotar (single-use). Un token con `rotated_at` presentado fuera de gracia = reuso (FR-004b). |
| `replaced_by` | UUID? (FK→RefreshToken) | Enlace al sucesor (traza de rotación; soporta ventana de gracia FR-004d). |
| `created_at` | timestamptz | |

**Invariantes:**
- Rotación **single-use** (FR-004): al usar un refresh vigente, se marca `rotated_at` y se crea el sucesor.
- **Reuso** de un token con `rotated_at` **fuera** de la ventana de gracia (10 s) → **revoca la familia**
  (Session.revoked_at) + añade `sid` al set de revocación en memoria (FR-004b).
- **Reintento dentro de gracia** (mismo token, ≤10 s tras `rotated_at`) → devuelve el resultado ya
  emitido vía `replaced_by` (idempotente, no revoca — FR-004d).

## Entidad: `LoginAttempt` (lockout / anti-enumeración)  *(puede ser tabla o store en memoria)*

| Campo | Tipo | Reglas / Notas |
|---|---|---|
| `key` | string (PK lógica) | `user_id` resuelto **o** hash del `identifier` no resuelto (FR-011). |
| `window_start` | timestamptz | Inicio de la ventana fija de 15 min. |
| `count` | int | Intentos fallidos en la ventana. |
| `locked_until` | timestamptz? | Set al superar el umbral (5). Los intentos durante el bloqueo no lo extienden. |

> Implementación: puerto `RateLimitPort` con adaptador **in-memory** en el slice (D7). La forma de datos
> anterior documenta el contrato lógico; no exige tabla física en 001 (single-instance).

## Base-ready: `DeniedAccessAudit` *(NO se implementa en 001 — diseño para no reescribir)*

Constitution XI (auditoría de accesos denegados) es **stretch/base-ready**. El esquema queda preparado
para añadir esta tabla por FK a `User` **sin** ALTER destructivo:

| Campo (futuro) | Tipo | Notas |
|---|---|---|
| `id` | UUID v7 (PK) | |
| `actor_id` | UUID? (FK→User) | `null` si no autenticado (401). |
| `outcome` | enum | `401 | 403 | 404`. |
| `endpoint` | string | Ruta (sin PII). |
| `resource_ref` | string? | Identificador **opaco** (no PII cruda). |
| `at` | timestamptz | |

> No se crea la migración en 001; se documenta para que el modelo actual la admita (regla "diseña la base
> para no reescribirla"). Se materializa cuando el backlog la promueva (BL-002).

## Diagrama de relaciones (textual)

```
User 1───* Session 1───* RefreshToken
  │                          └─ replaced_by ─┐ (cadena de rotación)
  └─(futuro)─* DeniedAccessAudit   ◄──────────┘
```

## Mapa entidad → FR

| Entidad | FRs |
|---|---|
| User | FR-001, FR-001b, FR-002, FR-006, FR-004c, FR-011 |
| Session | FR-001, FR-003, FR-003b, FR-004b |
| RefreshToken | FR-004, FR-004b, FR-004d, FR-005 |
| LoginAttempt | FR-011 |
| DeniedAccessAudit (base-ready) | Constitution XI / BL-002 |
