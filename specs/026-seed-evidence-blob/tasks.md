# Tasks: Seed de desarrollo con blob de evidencia real

**Feature**: `026-seed-evidence-blob` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Habilitador **backend/tooling** de dev. **TDD fase Red** (test en rojo antes de implementar). Tests en `backend/tests/`; la suite usa su **BD de test independiente**. El seed real corre en el **contexto del contenedor backend**. **0 contrato/dominio/RBAC/prod** (FR-008). Verificado en G2: `putStaged` **no** es content-addressed (ref no determinista) y `gc-job` filtra `reason:'execution_registered'` para el ciclo vigente.

## Phase 1: Setup

- [ ] T001 [P] Extraer la validación de `EVIDENCE_ENC_KEY` (≥32) a un **helper compartido** en `backend/src/infra/` reutilizado por `config.ts` y el seed (FR-013). **Test Red** previo: (a) `config.ts` y el seed **importan el mismo helper** (no una copia); (b) `loadConfig()` sigue **rechazando** clave ausente/<32 tras el refactor (no debilita producción).
- [ ] T002 [P] Definir la **constante de imagen JPEG mínima válida** (magic bytes `image/jpeg`, ≤2048 bytes) embebida en el seed + helper de fixture (FR-002).

## Phase 2: User Story 3 — Guards del seed (P1 seguridad) — Red → Green

- [ ] T003 [P] [US3] **Test Red** en `backend/tests/**/seed-evidence-blob.spec.ts`: el guard **aborta exit≠0 sin escribir fila ni blob** con (a) `NODE_ENV=production`; (b) hostname de `DATABASE_URL` ∉ `{db,localhost,127.0.0.1}` (match **exacto**; rechaza `evil-db.example.com`); (c) `EVIDENCE_ENC_KEY` ausente/<32. El mensaje **nombra la causa** y **NO interpola** ni la `DATABASE_URL` con credenciales **ni el valor** de `EVIDENCE_ENC_KEY` (solo ausencia/longitud) (FR-003/FR-004; rbac S-001).
- [ ] T004 [US3] Implementar el **guard dev-local** en `backend/prisma/seed.ts` (helper de T001; `new URL(DATABASE_URL).hostname` exacto; `NODE_ENV`), antes de escribir nada — verde de T003.

## Phase 3: User Story 1 — Blob real servible (P1) 🎯 MVP — Red → Green

- [ ] T005 [P] [US1] **Test Red — ida y vuelta + fila** (backend): el seed escribe el blob vía `StoragePort.putStaged` (adaptador como `container.ts:75`, `baseDir`/`encKey` de env) y (a) el binario se **lee/descifra** de vuelta por el mismo adaptador; (b) la fila `OrderEvidence` usa el **`object_ref` devuelto** por `putStaged` (no el placeholder); (c) el blob se escribe **antes que la fila** y las escrituras de BD van en **transacción** (interrupción ⇒ BD vacía) (FR-001/FR-007/FR-010).
- [ ] T006 [P] [US1] **Test Red — 200 vía endpoint** (integración, supertest): tras sembrar, `GET /v1/orders/{ancla}/evidence/{evidence_id}` con sesión de **técnico dueño** y de **supervisor** → **200** con el binario (content-type correcto); dispatcher/otros → 404 (autz heredada, sin cambios) (FR-001/SC-001; auditor T-002).
- [ ] T007 [US1] Implementar en `backend/prisma/seed.ts`: construir `FsStorageAdapter`, `putStaged(imagen embebida)`, usar el ref devuelto en la fila, blob-antes-que-fila en transacción; sustituir el `objectRef` placeholder — verde de T005/T006.
- [ ] T008 [US1] **FR-014 — el GC no purga la evidencia sembrada**: **Test Red** que corre el `runStagingGc` **real** de 024 tras sembrar y verifica que el blob **sobrevive** (getOrderEvidence sigue 200); luego implementar en el seed el `OrderAudit` ancla con `reason:'execution_registered'` (hoy `null`) para que `gc-job.ts::latestSubmitAuditId` lo reconozca vigente. Verificar **sin regresión** de 019/006 (tests de la orden ancla) (FR-014).
- [ ] T009 [US1] **FR-009 — almacén no escribible**: **Test Red** que simula `EVIDENCE_STORAGE_DIR` inexistente/no escribible (permisos 000 o ruta inválida) al escribir el blob → el seed **aborta con mensaje accionable que nombra la ruta**, **sin** dejar la fila sin blob; luego implementar el manejo (FR-009/FR-010).

**Checkpoint US1**: evidencia sembrada servible 200 y persistente frente al GC.

## Phase 4: User Story 2 — Tooling a la BD/almacén navegados + `make reset` (P1) — Red → Green

- [ ] T010 [P] [US2] **Test Red** (script de reset/seed, spawn mockeable): (a) `make reset` ejecuta la secuencia en el **contexto del contenedor backend** (guard → `prisma migrate reset --force --skip-seed` → vaciar `EVIDENCE_STORAGE_DIR` → re-sembrar); (b) **orden**: si el guard falla, `prisma migrate reset` **nunca** se invoca; (c) `EVIDENCE_STORAGE_DIR` **ausente** ⇒ el borrado **no falla** (mkdir -p idempotente); (d) `make up`/`make seed` invocan el mismo seed con blob, no `dcnode.sh`→`db-test` (FR-005/FR-006/FR-011).
- [ ] T011 [US2] Editar `Makefile` (`up`/`seed` en `docker compose run --rm backend`; nuevo `reset`); **decidir el destino de `scripts/dcnode.sh`** y **auditar TODOS los targets** que lo invocan para que ninguno siembre `db-test` en el flujo de dev (H-003); actualizar el **texto** de `RESEED_HINT` → `make reset` (sin cambiar el `throw`; test 019 usa la constante); CI (`npm run seed`) intacto — verde de T010.

## Phase 5: Polish & Cross-Cutting

- [ ] T012 [P] **Test arquitectónico/gobernanza** (FR-002/FR-008/SC-004): 0 cambios en `contracts/`, dominio, RBAC y handlers `getOrderEvidence`/`uploadOrderEvidence`; la imagen es **constante embebida** (no se añaden ficheros de asset nuevos al repo); el `Makefile`/comando de seed **no pasa `EVIDENCE_ENC_KEY` por argv** (`-e KEY=valor`), se hereda por `env_file` (rbac S-002; consistencia K-003).
- [ ] T013 [P] Actualizar `docs/traceability.md` (026: FR-001..FR-014, sin FR-012, → tarea → test).
- [ ] T014 Ejecutar `make reset` real + validar `quickstart.md` (200 para la evidencia ancla; persiste tras `docker compose restart backend`/GC; reconexión del pool o fallback); suite backend verde con su BD de test; `tsc`/`eslint`.

## Dependencies

- **Setup (T001–T002)** → antes de todo.
- **US3 guards (T003→T004)** primero (seguridad antes de escribir).
- **US1 (T005/T006 Red → T007 → T008 GC → T009 almacén)**: MVP.
- **US2 (T010 Red → T011)**: tooling; depende de que el seed (T007) escriba el blob.
- **Polish (T012–T014)**: tras US1+US2.

## Parallel Opportunities

- T001 ∥ T002; T003 ∥ T005 ∥ T006 ∥ T010 (bloques de test independientes); T012 ∥ T013.

## Implementation Strategy

- **MVP = US1** (blob servible 200 + persistente frente al GC) sobre los guards de US3.
- **Incremento = US2** (tooling al entorno navegado + `make reset`).
- TDD Red-primero: T001/T003/T005/T006/T008/T009/T010 en rojo antes de su implementación.
