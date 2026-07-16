# Data Model — Evidencia binaria (024)

Deriva de `spec.md` §Key Entities y del schema verificado. **No hay migración de tabla nueva**: se reutiliza `OrderEvidence` (append-only) y se introduce almacenamiento de blobs vía puerto (fuera de Prisma).

## Entidad: OrderEvidence (existente — `backend/prisma/schema.prisma:152-169`)

Fila de metadatos por evidencia **committeada**. Append-only e inmutable (trigger de BD).

| Campo | Tipo | Notas para 024 |
|-------|------|----------------|
| `id` (uuid) | PK | **Es el `evidenceId` público** expuesto en `items[]` y en la ruta `getOrderEvidence` (no se sintetiza campo nuevo). |
| `orderId` (uuid) | FK Order | Pertenencia; base de la verificación `evidenceId ∈ orderId` (FR-015). |
| `auditId` (uuid) | FK OrderAudit | Enlace al submit que la creó (no-repudio, ciclo). |
| `objectRef` (text) | ref opaca | **client-visible SOLO en upload↔submit**; nunca en logs ni en lectura/detalle. **Único por fila** (no compartido entre attempts, FR-023.b). |
| `contentType` (string) | allowlist | `image/{jpeg,png,webp,heic}`. |
| `sizeBytes` (int) | 1..26214400 | ≤25 MiB. |
| `uploadedBy` (uuid) | FK User | Técnico que subió (del token, nunca del body). |
| `attempt` (int?) | ciclo | Discrimina ciclo; el vigente = `attempt`/audit más reciente enviado. |
| `at` (timestamptz) | default now | — |

**Invariantes 024**:
- **Un `objectRef` ↔ una fila** → el GC por fila (superada) nunca purga un blob de la fila vigente.
- **Si hay blob → hay fila**; una **fila puede sobrevivir sin blob** (purgado por retención/superado, o legacy) → lectura autorizada en alcance devuelve **410**.
- La fila existe **solo tras el submit**; un **blob staged** no tiene fila (no direccionable por `getOrderEvidence` ni en `items[]`).

## Objeto de almacenamiento (NO en Prisma — `StoragePort`)

El binario vive en el store (filesystem dev/test, S3-like prod), **cifrado AES-256-GCM**.

| Concepto | Descripción |
|----------|-------------|
| **Blob staged** | Objeto subido por `uploadOrderEvidence`, aún sin submit. Sin fila. Metadata: `ownerId`, `orderId`, `createdAt` (para TTL 24 h y GC). |
| **`object_ref`** | Token opaco **HMAC-firmado** que codifica `(ownerId, orderId, createdAt, nonce)`; identifica el blob y liga staging a (dueño, orden) sin tabla. |
| **Firma de lectura interna** | Handle con **TTL ≤300 s** que el backend usa para leer el objeto del store; **nunca** se expone al cliente (SC-003). |
| **Blob committeado** | Blob referenciado por una fila `OrderEvidence` tras el submit. Rige la retención (90 d post-cierre). |

## Estados del ciclo de vida de un blob

```text
(subida) uploadOrderEvidence ──► STAGED (sin fila; TTL 24h)
                                   │
              submit lo referencia │            ├─ abandonado / rollback / dueño saliente ─► GC (FR-024)
                                   ▼            └─ edad > 24h sin submit ──────────────────► GC (FR-024)
                                COMMITTED (fila OrderEvidence vigente)
                                   │
        reenvío tras rechazo crea  │ nuevo attempt con blobs PROPIOS (re-subidos)
        y marca superado el ciclo  ▼
                                SUPERADO (fila superada) ──► GC físico (FR-024) · lectura autz en alcance ─► 410
                                   │
             orden closed >90d     ▼
                                PURGADO por retención (FR-018) · sin ruta de acceso (closed → 404)
```

## Reglas de validación (dominio — `domain/order/evidence.ts` ampliado)

- **Allowlist tipo**: `image/{jpeg,png,webp,heic}` → fuera de allowlist **415**.
- **Contenido real** (magic-bytes; HEIC por marca `ftyp`): tipo declarado en allowlist pero contenido falseado/corrupto → **422**.
- **Tamaño**: >25 MiB o 0 bytes → **413** (cortado en streaming).
- **Tope de ciclo**: ≤10 blobs staged vivos; 11.º upload → **422**; `submit` con `evidence[]` >10 → **422**.
- **Submit re-verifica** cada `object_ref` (in-tx): ajeno/otra orden/otro actor → **404**; malformado → **422**; con fila ya creada → **422**; edad > TTL staging → **422**; sin fila y blob presente y dueño+orden OK → crea fila.
- **Repetidos**: `object_ref` repetido dentro del mismo `evidence[]` → **422** (entrada inválida; no se deduplica en silencio). El tope ≤10 se cuenta sobre el array crudo.

## Mapa RBAC (heredado de `getOrderDetail`)

| Rol | Subir (`uploadOrderEvidence`) | Leer (`getOrderEvidence`) |
|-----|-------------------------------|----------------------------|
| technician (dueño actual) | ✅ solo si orden `in_progress` | ✅ orden en alcance activo |
| supervisor | ❌ (404) | ✅ orden en alcance (`pending_review`) |
| dispatcher | ❌ (404) | ❌ (404, mínimo privilegio) |
| cualquiera sin sesión | 401 | 401 |
| orden `closed`/`draft` | 404 (fuera de alcance) | 404 (sin ventana de lectura) |
