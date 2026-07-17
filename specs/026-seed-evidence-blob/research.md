# Research — Seed dev con blob de evidencia real (026)

Decisiones de diseño, ancladas al código real.

## D1 — Escribir el blob con `StoragePort.putStaged` (reutilizar el puerto)

- **Decisión**: el seed construye un `FsStorageAdapter` **igual que `container.ts:75`** (`new FsStorageAdapter({ baseDir: EVIDENCE_STORAGE_DIR, encKey: EVIDENCE_ENC_KEY, clock })`) y llama a `putStaged({...bytes de imagen embebidos...})`. NO reimplementa el cifrado.
- **object_ref determinista (FR-007)**: `putStaged` es **content-addressed** (hash del contenido → `<hash>.bin`). La imagen embebida es fija ⇒ el `object_ref` devuelto es **estable entre ejecuciones**; re-sembrar sobrescribe el mismo fichero (idempotente, sin huérfanos). La fila `OrderEvidence` usa **ese ref devuelto**, no el placeholder literal actual (`018f2000-...-ev1`).
- **Servible por getOrderEvidence**: la fila referencia el objectRef ⇒ el GC de 024 lo trata como **committed** (referenciado), no lo purga; `getOrderEvidence` hace `signRead`+`read` y sirve 200. **A verificar en tasks/tests**: que un objeto de `putStaged` referenciado por una fila no es purgado por el GC de staging (semántica staged↔committed de 024).
- **Alternativa descartada**: escribir el fichero cifrado a mano en el seed → duplicaría el cifrado/derivación de claves de 024, frágil.

## D2 — Clave y validación (FR-003/FR-013)

- **Decisión**: el seed lee `EVIDENCE_ENC_KEY` del entorno (heredada del `env_file` del contenedor backend, D3) y la valida con un **helper compartido** extraído de `config.ts` (la regla `min 32`), sin invocar `loadConfig()` (que exige 13 campos). Si falta/!inválida → abort exit≠0 con mensaje que nombra la variable y la acción.
- **Rationale**: una sola fuente de verdad para «clave válida» (no diverge). El helper vive en `infra`.

## D3 — Ejecutar en el contexto del contenedor backend (FR-006/FR-011)

- **Decisión**: `make up`/`make seed`/`make reset` ejecutan el seed con `docker compose run --rm backend <cmd>` (override de dev fusionado ⇒ `NODE_ENV=development`, `DATABASE_URL=db/fieldops`, volumen de `EVIDENCE_STORAGE_DIR`). Así clave, BD, almacén y UID coinciden **por construcción** con el backend navegado. Se abandona la ruta `scripts/dcnode.sh` (contenedor `node` efímero → `db-test`) para la siembra de **dev**; CI sigue con `npm run seed` (su BD).
- **Rationale**: elimina desincronía de clave/BD/almacén/permisos (hallazgos G1). El guard lee el `NODE_ENV`/`DATABASE_URL` efectivos del mismo contenedor.

## D4 — Guard dev-local positivo (FR-004)

- **Decisión**: antes de escribir nada (y como preflight de `make reset`, antes del `prisma migrate reset`), el seed aborta salvo que: `NODE_ENV !== 'production'` (pre/prod usan `production`, docs/16:45) **Y** `new URL(DATABASE_URL).hostname` ∈ `{db, localhost, 127.0.0.1}` por **igualdad exacta**. El mensaje imprime solo el hostname (nunca la URL con credenciales).
- **Rationale**: doble barrera fail-closed contra sembrar/resetear un entorno real, sin depender solo de NODE_ENV.

## D5 — Modelo reset-y-siembra (FR-010/FR-011/FR-012 retirado)

- **Decisión**: sin ruta incremental. `make reset` (en el contenedor backend): (0) guard → (a) `prisma migrate reset --force --skip-seed` → (b) vaciar el **contenido** de `EVIDENCE_STORAGE_DIR` (mkdir -p, idempotente) → (c) re-sembrar. Seed **atómico**: blob antes que fila, escrituras de BD en transacción (interrupción ⇒ BD vacía). `make up`/`make seed` invocan el mismo seed con blob (sin el reset destructivo); sobre BD poblada, `ensureSeedableOrThrow` fail-fast (RESEED_HINT→`make reset`), **sin cambiar su comportamiento** (solo el texto del hint). `make reset` **no orquesta** stop/start de servicios; el pool de Prisma reconecta tras el reset (a verificar en quickstart; fallback: `docker compose restart backend`).
- **Rationale**: dos cortes anti-espiral en G1 — quitar idempotencia de make up y orquestación de contenedores — eliminaron clases enteras de edge cases por diseño.
