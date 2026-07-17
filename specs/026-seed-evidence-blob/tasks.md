# Tasks: Seed de desarrollo con blob de evidencia real

**Feature**: `026-seed-evidence-blob` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Habilitador **backend/tooling** de dev. **TDD fase Red** (test en rojo antes de implementar). Tests en `backend/tests/`; la suite usa su **BD de test independiente**. El seed real corre en el **contexto del contenedor backend**. **0 contrato/dominio/RBAC/prod** (FR-008).

## Phase 1: Setup

- [ ] T001 [P] Extraer la validación de `EVIDENCE_ENC_KEY` (presente, ≥32) a un **helper compartido** en `backend/src/infra/` (p. ej. `assertEvidenceEncKey`/schema fragment) y reutilizarlo desde `config.ts` **sin cambiar su comportamiento** (FR-013) — refactor.
- [ ] T002 [P] Definir la **constante de imagen JPEG mínima válida** (magic bytes `image/jpeg`, ≤2048 bytes) embebida en el seed (o un módulo dev del seed) + helper de fixture para tests (FR-002).

## Phase 2: User Story 3 — Guards del seed (P1 seguridad) — Red → Green

**Goal**: el seed nunca escribe (ni resetea) fuera de dev-local ni con clave inválida.

- [ ] T003 [P] [US3] **Test Red** en `backend/tests/**/seed-evidence-blob.spec.ts`: el guard **aborta con salida ≠0 sin escribir fila ni blob** cuando (a) `NODE_ENV=production`; (b) `hostname` de `DATABASE_URL` no ∈ `{db,localhost,127.0.0.1}` (match **exacto**; `evil-db.example.com` rechazado); (c) `EVIDENCE_ENC_KEY` ausente/<32. El mensaje **nombra la causa** (NODE_ENV / hostname / EVIDENCE_ENC_KEY) y **no imprime la `DATABASE_URL`** con credenciales (FR-003/FR-004).
- [ ] T004 [US3] Implementar el **guard dev-local** en `backend/prisma/seed.ts` (usa el validador compartido de T001; `new URL(DATABASE_URL).hostname` con igualdad exacta; lee `NODE_ENV`), ejecutado **antes de escribir nada** — verde de T003.

## Phase 3: User Story 1 — Blob real servible (P1) 🎯 MVP — Red → Green

**Goal**: `getOrderEvidence` sirve **200** el blob de la evidencia sembrada.

- [ ] T005 [P] [US1] **Test Red**: el seed escribe el blob vía `StoragePort.putStaged` (adaptador construido como `container.ts:75`, `baseDir`/`encKey` de env) y (a) el binario se **lee/descifra** de vuelta correctamente por el mismo adaptador (ida y vuelta → 200); (b) la fila `OrderEvidence` usa el **`object_ref` devuelto por `putStaged`** (no el placeholder); (c) es **determinista** (misma imagen → mismo `object_ref`); (d) el **blob se escribe antes que la fila** y las escrituras de BD van en **transacción** (interrupción ⇒ BD vacía); (e) un objeto referenciado por la fila **no es purgado** por el GC de staging (FR-001/FR-007/FR-010).
- [ ] T006 [US1] Implementar en `backend/prisma/seed.ts`: construir `FsStorageAdapter`, `putStaged(imagen embebida)`, usar el ref devuelto en la fila, blob-antes-que-fila dentro de transacción; sustituir el `objectRef` placeholder actual (FR-001/FR-007/FR-010) — verde de T005.

## Phase 4: User Story 2 — Tooling a la BD/almacén navegados + `make reset` (P1) — Red → Green

**Goal**: `make up`/`make seed`/`make reset` pueblan la BD y almacén que ve el navegador; recuperación por `make reset`.

- [ ] T007 [P] [US2] **Test Red** (script de reset/seed, spawn mockeable): (a) `make reset` ejecuta la secuencia en el **contexto del contenedor backend** (guard → `prisma migrate reset --force --skip-seed` → vaciar `EVIDENCE_STORAGE_DIR` → re-sembrar); (b) **orden**: si el guard falla, `prisma migrate reset` **nunca** se invoca (no solo exit≠0); (c) `EVIDENCE_STORAGE_DIR` **ausente** ⇒ el borrado **no falla** (idempotente, `mkdir -p`); (d) `make up`/`make seed` invocan el mismo seed con blob, no `dcnode.sh`→`db-test` (FR-005/FR-006/FR-011).
- [ ] T008 [US2] Editar `Makefile` (`up`/`seed` en `docker compose run --rm backend`; nuevo target `reset`) y revisar `scripts/dcnode.sh`; actualizar el **texto** de `RESEED_HINT` para apuntar a `make reset` (sin cambiar el `throw` de `ensureSeedableOrThrow`; el test 019 usa la constante). Verificar que CI (`npm run seed`) **no** se toca (FR-006/FR-011) — verde de T007.

## Phase 5: Polish & Cross-Cutting

- [ ] T009 [P] **Test arquitectónico** (FR-008/SC-004): 0 cambios en `contracts/`, en la lógica de dominio, en RBAC y en el código de los handlers `getOrderEvidence`/`uploadOrderEvidence` (diff/grep vs develop).
- [ ] T010 [P] Actualizar `docs/traceability.md` (sección 026: FR-001..FR-013 → tarea → test).
- [ ] T011 Ejecutar `make reset` real + validar `quickstart.md` (200 para la evidencia ancla; reconexión del pool de Prisma con el backend en caliente, o fallback `restart`); suite backend verde con su BD de test; `tsc`/`eslint`.

## Dependencies

- **Setup (T001–T002)** → antes de todo.
- **US3 guards (T003→T004)** primero (seguridad antes de cualquier escritura).
- **US1 (T005→T006)**: MVP (blob servible).
- **US2 (T007→T008)**: tooling; depende de que el seed (T006) escriba el blob.
- **Polish (T009–T011)**: tras US1+US2.

## Parallel Opportunities

- T001 ∥ T002; T003 ∥ T005 ∥ T007 (bloques de test independientes); T009 ∥ T010.

## Implementation Strategy

- **MVP = US1** (blob servible 200) sobre los guards de US3.
- **Incremento = US2** (tooling al entorno navegado + `make reset`).
- TDD Red-primero: T003/T005/T007 en rojo antes de T004/T006/T008.
