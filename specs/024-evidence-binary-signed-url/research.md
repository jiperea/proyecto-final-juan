# Research — Evidencia binaria y URL firmada (024)

Decisiones de diseño (Phase 0). No quedan `NEEDS CLARIFICATION` (el G1 cerró la ambigüedad; aquí se fija el «cómo» técnico anclado al repo).

## D1 · Puerto de almacenamiento (`StoragePort`)

- **Decisión**: crear `domain/ports/storage.ts` con operaciones puras (interface): `putStaged(bytes, {ownerId, orderId, contentType}) → objectRef`; `signRead(objectRef, ttlSeconds) → signedHandle`; `read(signedHandle) → bytes | Expired`; `list() → {objectRef, createdAt}[]`; `delete(objectRef)`. Cifrado/descifrado AES-256-GCM y firma HMAC viven **en el adaptador** (`infra/storage/fs-storage-adapter.ts`), no en el dominio.
- **Rationale**: no existe hoy ningún puerto de storage (`crypto/` es solo password/token). El puerto mantiene el dominio puro y testeable con un fake; la firma-con-TTL es una **propiedad del puerto** que todo adaptador implementa (incl. mock) → SC-003 testeable en dev sin cloud.
- **Alternativas rechazadas**: binario en Postgres `bytea` (carga la BD con PII, rompe firma≤300 s / S3-like); usar `crypto/` existente (es hashing, no cifrado simétrico con clave).

## D2 · Metadatos de staging sin tabla nueva

- **Decisión**: el `object_ref` es un **token opaco HMAC-firmado** que codifica `(ownerId, orderId, createdAt, nonce)`; el objeto almacenado guarda además esa metadata. La verificación de FR-023 (staged por dueño+orden, edad ≤ TTL) se hace **decodificando/verificando el ref** (sin lookup) y comprobando en la transacción del submit que **no existe fila `OrderEvidence` con ese `objectRef`** (FR-023.b) y que el **blob existe** (re-lectura in-tx).
- **Rationale**: preserva el invariante «staged = sin fila» (FR-011/FR-022) sin estado mutable extra (Principio XV). El GC (D5) no depende de este check (usa edad del objeto).
- **Alternativas rechazadas**: tabla `EvidenceStaging` (estado mutable fuera del append-only, más deriva); guardar owner/orderId solo en memoria (no sobrevive reinicio).

## D3 · Autorización heredada (sin regla nueva)

- **Decisión**: `getOrderEvidence` y `uploadOrderEvidence` montan **solo `auth`** (como `getOrderDetail` en `app.ts:108`, **sin `requireRole`**) y resuelven la autz **dentro** con `isOrderVisible(role, userId, order)` (`read-side/order-detail-visibility.ts`) + comprobación de estado (`in_progress` para subir; en-alcance para leer). Todo denegado → **404 uniforme**. `uploadOrderEvidence` aplica **autz-primero** (FR-020): valida forma/tipo/tamaño solo tras autorizar.
- **Rationale**: FR-003/FR-020 exigen herencia EXACTA; reutiliza `orderScopeFor` (única fuente rol→alcance). `closed`/`draft` fuera de alcance → 404 sin ventana de lectura (decisión r8/S-008).
- **Alternativas rechazadas**: `requireRole` en la ruta (un 403 revelaría existencia); regla de acceso nueva para `closed` (contradice FR-003, amplía RBAC).

## D4 · Ciclo upload→submit y un-blob-una-fila

- **Decisión**: `uploadOrderEvidence` valida (streaming, corta a 25 MiB) → cifra → guarda staged → devuelve `object_ref`. `submitOrderExecution` **conserva su cuerpo JSON** (`ExecutionRequest.evidence[]` con `object_ref`) y en su transacción Prisma existente (`order-write-side-repository.ts:274-326`) re-verifica cada ref (dueño actual + orden + sin fila previa + blob existe) y crea las filas `OrderEvidence` (con `auditId`/`attempt`). Reenvío tras rechazo → **re-subir** (no reusar ref committeado, FR-023.b): cada blob pertenece a **una** fila.
- **Rationale**: cierra H-001 (GC no puede purgar blob compartido) y mantiene compatibilidad de contrato (el cuerpo de submit no cambia). El `id` (uuid) de `OrderEvidence` **es** el `evidenceId` público (no hace falta campo nuevo).
- **Alternativas rechazadas**: cambiar el cuerpo de submit a multipart (rompe compatibilidad); compartir `object_ref` entre attempts (reabre H-001).

## D5 · GC y retención (dos jobs programados)

- **Decisión**: (a) **GC de staging/superados** (`gc-job.ts`, FR-024): lista blobs del store; purga los que **no tienen fila vigente** (staged con edad > TTL 24 h, o huérfanos por rollback, o fila **superada**). (b) **Purga por retención** (`retention-job.ts`, FR-018): órdenes `closed` con antigüedad > 90 d → purga física del blob (sin semántica de acceso). Ambos corren **al menos a diario** (latencia ≤ 24 h). El submit re-lee el blob **dentro de su transacción**, así el GC nunca deja fila-vigente-sin-blob (cierre H-002).
- **Rationale**: separa purga inmediata-lógica (reemplazo en el commit) de purga física (job); un-blob-una-fila hace el GC seguro por fila.
- **Alternativas rechazadas**: purga perezosa en la lectura (no garantiza retención de binarios nunca accedidos); GC que borre por edad sin mirar fila (borraría vigentes).

## D6 · Cifrado en reposo y config

- **Decisión**: **AES-256-GCM** con clave de 32 bytes desde `config.ts` (Zod `min(32)`, fail-fast, `assertSecretsDistinct` como `JWT_SECRET`); IV aleatorio por objeto, tag GCM verificado al leer. Nuevas config: `EVIDENCE_ENC_KEY`, `EVIDENCE_SIGN_TTL_SECONDS` (≤300, default 300), `EVIDENCE_STAGING_TTL_HOURS` (default 24). Prohibido `mock`/clave simbólica en producción.
- **Rationale**: patrón idéntico al de secretos existentes (`infra/config.ts:57-111`). SC-004 verifica leyendo bytes crudos del adaptador (bypaseando descifrado) que difieren del plano.
- **Alternativas rechazadas**: AES-CBC sin tag (sin integridad autenticada); clave hardcodeada (prohibido).

## D7 · Lectura en el front (blob same-origin)

- **Decisión**: `getOrderEvidence` responde 200 con el binario, `X-Content-Type-Options: nosniff`, `Content-Type` del **magic-byte real**, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. El front (`OrderDetailView.tsx`) hace **fetch autenticado → `blob:`** en memoria; nunca pone URL/token en `<img src>`/DOM/Referer. Estados carga/error. Tipos regenerados del contrato (`items[]`, nuevos endpoints).
- **Rationale**: sin capacidad portadora del lado cliente (cierra vector bearer/DOM/Referer); endurecimiento anti-polyglot (S-009).
- **Alternativas rechazadas**: `<img src>` con URL firmada de cliente (fuga por DOM/Referer/historial); pre-signed PUT/GET cloud (fuera de alcance dev, rompe control server-side).

## D8 · Multipart en streaming

- **Decisión**: parser `busboy` con límite duro 25 MiB que **aborta sin bufferizar** el fichero entero; valida allowlist por `content_type` declarado y **magic-bytes** del stream (HEIC por marca `ftyp` ISO-BMFF, sin decodificar). Un solo fichero por request de subida (acumulación por múltiples `uploadOrderEvidence`, tope ≤10 vivos).
- **Rationale**: evita DoS por memoria; validación de contenido real determinista (FR-019).
- **Alternativas rechazadas**: `multer` a disco temporal sin cifrar (PII en claro en tmp); decodificación completa de HEIC (no determinista en Node sin libs nativas).
