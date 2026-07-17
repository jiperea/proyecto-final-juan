---
description: "Task list — Evidencia fotográfica binaria y visualización por URL firmada (024)"
---

# Tasks: Evidencia fotográfica — binario y visualización por URL firmada (024)

**Input**: Design documents from `specs/024-evidence-binary-signed-url/`

**Prerequisites**: plan.md ✅ · spec.md ✅ (G1 PASS) · research.md ✅ · data-model.md ✅ · contracts/ ✅ · quickstart.md ✅

**Tests**: OBLIGATORIOS (Constitution VII — TDD fase Red: commit del test en rojo antes de implementar).

**Organization**: por historia de usuario (las 3 son P1). US1 y US2 son el MVP de producto; US3 es transversal de seguridad/privacidad (algunos controles se testean dentro de US1/US2 y otros como jobs propios).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (ficheros distintos, sin dependencias pendientes)
- Rutas exactas en cada tarea. Backend hexagonal (`backend/src/{domain,handlers,infra}`), front (`frontend/src/`).

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Añadir dependencia de parser multipart en streaming (`busboy`) a `backend/package.json` (y tipos) sin tocar otras versiones.
- [x] T002 [P] Añadir config nueva en `backend/src/infra/config.ts` (Zod fail-fast, patrón de `JWT_SECRET`): `EVIDENCE_ENC_KEY` (`z.string().min(32)`), `EVIDENCE_SIGN_TTL_SECONDS` (`z.coerce.number().int().min(1).max(300).default(300)`), `EVIDENCE_STAGING_TTL_HOURS` (default 24); incluir `EVIDENCE_ENC_KEY` en `assertSecretsDistinct`; prohibir clave `mock`/simbólica en producción.
- [x] T003 [P] Actualizar `.env.example` con las tres variables nuevas y un valor de ejemplo dev (no secreto real).
- [x] T004 Aplicar el delta de contrato `specs/024-evidence-binary-signed-url/contracts/evidence-endpoints.delta.yaml` sobre `contracts/orders.openapi.yaml` (nuevos `uploadOrderEvidence`, `getOrderEvidence`; `EvidenceMeta.items[]`), manteniendo evolución compatible. *(steward-contract)*
- [x] T005 Regenerar tipos/Zod derivados del contrato: `frontend/src/api/generated/orders` + `frontend/src/api/{types.ts,schemas.ts}` (añadir `items[]` y esquemas de subida/lectura); verificar `snake_case` externo.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: el `StoragePort` bloquea todas las historias. Sin él no hay subida, lectura ni cifrado.

- [x] T006 [P] Test en rojo del puerto (contrato del fake): `backend/tests/unit/storage-port.spec.ts` — define el contrato esperado de `StoragePort` (put staged devuelve object_ref ligado a owner+order+createdAt; signRead con TTL; read de handle caducado falla; list/delete). Debe FALLAR (no existe el puerto).
- [x] T007 Crear el puerto `backend/src/domain/ports/storage.ts` (interface pura `StoragePort`: `putStaged`, `signRead`, `read`, `list`, `delete`; tipos `ObjectRef`, `SignedReadHandle`); el dominio NO importa crypto/fs.
- [x] T008 [P] Test en rojo del adaptador: `backend/tests/integration/fs-storage-adapter.spec.ts` — AES-256-GCM (bytes crudos ≠ plano), firma HMAC con expiración ≤300 s, list/delete por edad. Debe FALLAR.
- [x] T009 Implementar `backend/src/infra/storage/fs-storage-adapter.ts` (filesystem + `node:crypto` AES-256-GCM con IV por objeto + tag verificado; object_ref = token HMAC-firmado con `(ownerId,orderId,createdAt,nonce)`; firma de lectura con TTL).
- [x] T010 Crear fake del puerto para tests de dominio/handlers: `backend/tests/helpers/fake-storage.ts` (en memoria, honra TTL y firma).
- [x] T011 Cablear `StoragePort → fs-storage-adapter` en `backend/src/infra/container.ts` (inyección; en test se inyecta el fake).

**Checkpoint**: puerto + adaptador + fake listos; las historias pueden empezar.

---

## Phase 3: User Story 1 — El técnico sube fotos reales (Priority: P1) 🎯 MVP

**Goal**: `uploadOrderEvidence` almacena blobs cifrados en staging y `submitOrderExecution` crea las filas `OrderEvidence` referenciando esos blobs.

**Independent Test**: técnico dueño de orden `in_progress` sube 1..N imágenes válidas y envía; `count == N`, filas creadas, blobs cifrados; negativos 415/413/422 y 404 por no-dueño.

### Tests (Red primero) ⚠️

- [x] T012 [P] [US1] Contract test `backend/tests/contract/upload-evidence.contract.spec.ts` — `uploadOrderEvidence` × {201, 401, 404, 413, 415, 422}.
- [x] T013 [P] [US1] Integration test `backend/tests/integration/evidence-upload-store.spec.ts` — 201 con object_ref; blob cifrado; `count` tras submit (FR-001).
- [x] T014 [P] [US1] Integration test `backend/tests/integration/evidence-upload-authz.spec.ts` — autz-primero: no-dueño/estado≠in_progress → 404 antes de validar contenido (FR-020).
- [x] T015 [P] [US1] Integration test `backend/tests/integration/evidence-content-validation.spec.ts` — magic-bytes; tipo fuera allowlist → 415; falseado/corrupto → 422; HEIC por marca `ftyp` (FR-019).
- [x] T016 [P] [US1] Integration test `backend/tests/integration/evidence-cycle-lifecycle.spec.ts` — acumula ≤10 (array crudo); 11.º → 422; submit>10 → 422; **`object_ref` repetido en `evidence[]` → 422** (no dedup silencioso) (FR-022/FR-023).
- [x] T017 [P] [US1] Integration test `backend/tests/integration/evidence-ref-ownership.spec.ts` — submit re-verifica ref (ajeno/otra orden/otro actor → 404; malformado → 422; fila-existente → 422; expirado → 422; repetido → 422); doble-submit → 409 (FR-023).
- [x] T050 [P] [US1] Integration test `backend/tests/integration/evidence-atomic-gc.spec.ts` — fallo intermedio (blob staged escrito, transacción de submit hace rollback) → blob queda huérfano → GC lo purga; commit BD = verdad (FR-011).
- [x] T051 [P] [US1] Integration test `backend/tests/integration/evidence-cycle-replace.spec.ts` — reject → reenvío con fotos nuevas → attempt anterior marcado superado **inmediato al commit**; `getOrderDetail.items`/`getOrderEvidence` exponen solo el ciclo vigente; evidenceId superados → 410 a autorizados en alcance (FR-017).

### Implementación

- [x] T018 [US1] Ampliar reglas de dominio en `backend/src/domain/order/evidence.ts` (validación de contenido real/magic-bytes + HEIC `ftyp`; tope de ciclo ≤10 sobre el array crudo; **`object_ref` repetido en `evidence[]` → 422, NO deduplicar en silencio**).
- [x] T019 [US1] Handler `backend/src/handlers/orders/upload-evidence.ts` (multipart streaming con `busboy`, corte 25 MiB; autz-primero heredando `isOrderVisible` + estado `in_progress`; 404 uniforme; llama `StoragePort.putStaged`).
- [x] T020 [US1] Montar ruta `POST /v1/orders/:orderId/evidence` en `backend/src/handlers/app.ts` (solo `auth`, SIN `requireRole`, igual que getOrderDetail).
- [x] T021 [US1] Verificación de refs en el submit: `backend/src/domain/order/write-side/submit-execution.ts` + `backend/src/infra/repositories/order-write-side-repository.ts` (en la `$transaction` existente: re-verificar cada object_ref —dueño+orden, sin fila previa, blob existe in-tx—, **rechazar object_ref repetido en `evidence[]` con 422 (sin dedup silencioso)**, crear filas `OrderEvidence`; códigos 404/422/409).

**Checkpoint**: US1 funcional y testeable de forma independiente.

---

## Phase 4: User Story 2 — Ver/abrir la imagen desde el detalle (Priority: P1)

**Goal**: `getOrderEvidence` sirve el binario same-origin por sesión y el front lo abre desde un blob; `getOrderDetail` expone `items[]`.

**Independent Test**: supervisor abre la foto N de una orden `pending_review` (200 → blob); dispatcher → 404; firma interna ≤300 s; 0 URL cliente-visible.

### Tests (Red primero) ⚠️

- [x] T022 [P] [US2] Contract test `backend/tests/contract/get-evidence.contract.spec.ts` — `getOrderEvidence` × {200, 401, 404, 410} + cabeceras (nosniff/no-referrer/no-store) + **aserción backend de FR-004**: el cuerpo/headers de la 200 NO contienen ninguna URL firmada ni token de cliente.
- [x] T023 [P] [US2] `getOrderDetail.evidence.items[]` (evidence_id+content_type; omitido a dispatcher) — **cubierto in situ** en `backend/tests/contract/get-order-detail.contract.spec.ts` (aserción count===items.length) + `get-order-detail.technician.spec.ts`; no se crea fichero redundante.
- [x] T024 [P] [US2] Integration test `backend/tests/integration/evidence-authz.spec.ts` — dueño/supervisor 200, dispatcher 404 (FR-003); 100% pares rol×autz (SC-002).
- [x] T025 [P] [US2] Integration test `backend/tests/integration/evidence-404-uniforme.spec.ts` — 401 sin sesión; 404 no-autz/ajena/inexistente/closed; evidence_id∉order → 404 (FR-007/FR-015).
- [x] T026 [P] [US2] Integration test `backend/tests/integration/evidence-410-legacy-superado.spec.ts` — autorizado en alcance con blob legacy/superado → 410; closed → 404 (nunca 410) (FR-009).
- [x] T027 [P] [US2] Front test `frontend/src/features/orders/OrderDetailView.evidence.test.tsx` — abre imagen desde `blob:`, estados carga/error, sin URL en DOM (FR-010/FR-013) + axe.
- [x] T052 [P] [US2] Integration test `backend/tests/integration/evidence-reassign-access.spec.ts` — tras reasignar la orden (cambia `assigned_to`), el técnico **saliente** pierde acceso a `getOrderEvidence` (→404) y el **nuevo** dueño lo obtiene (→200); el supervisor mantiene el suyo; autz re-evaluada por petición (FR-016).

### Implementación

- [x] T028 [US2] Handler `backend/src/handlers/orders/get-evidence.ts` (autz heredada; precedencia 401→404→410; sirve binario con `signRead` interno ≤300 s; cabeceras nosniff/Content-Type-real/no-referrer/no-store; verifica evidence_id∈order).
- [x] T029 [US2] Montar ruta `GET /v1/orders/:orderId/evidence/:evidenceId` en `backend/src/handlers/app.ts` (solo `auth`).
- [x] T030 [US2] Ampliar `backend/src/handlers/orders/get-order-detail.ts` para incluir `evidence.items[]` (evidence_id = `OrderEvidence.id`, content_type; solo roles autorizados, omitido a dispatcher).
- [x] T031 [US2] Front: sustituir tiles no-clicables por miniatura/enlace real en `frontend/src/features/orders/OrderDetailView.tsx` (167-176) + hook de lectura por fetch→blob en `frontend/src/features/orders/useOrders.ts`; estados carga/error.
- [x] T032 [US2] Front: apuntar la subida de `EvidencePicker.tsx`/`ExecutionForm.tsx` al endpoint multipart `uploadOrderEvidence` (en `frontend/src/features/orders/write-api.ts`).

**Checkpoint**: US1 + US2 funcionan de forma independiente (MVP de producto completo).

---

## Phase 5: User Story 3 — Seguridad y privacidad de la evidencia (Priority: P1)

**Goal**: cifrado verificable, firma interna acotada, no-fuga en logs, auditoría, GC y retención.

**Independent Test**: bytes crudos ≠ plano; firma interna caduca ≤300 s; 0 apariciones en logs; acceso directo denegado; jobs de purga funcionan.

### Tests (Red primero) ⚠️

- [x] T033 [P] [US3] Integration test `backend/tests/integration/evidence-encryption-at-rest.spec.ts` — lee bytes crudos del adaptador (bypass descifrado) y afirma ≠ binario original byte a byte; AES-256-GCM (SC-004).
- [x] T034 [P] [US3] Integration test `backend/tests/integration/evidence-internal-signature-ttl.spec.ts` — firma interna caduca >300 s; cliente sin sesión no accede (SC-003/FR-005).
- [x] T035 [P] [US3] Integration test `backend/tests/integration/evidence-nolog.spec.ts` — grep de logs: 0 object_ref/firma/binario (SC-005/FR-008).
- [x] T036 [P] [US3] Integration test `backend/tests/integration/evidence-no-direct-access.spec.ts` — acceso directo al store sin firma interna → denegado (FR-006).
- [x] T037 [P] [US3] Integration test `backend/tests/integration/evidence-read-audit.spec.ts` — lectura autorizada deja registro append-only sin binario; denegados emiten señal best-effort (FR-021/FR-007).
- [x] T038 [P] [US3] Integration test `backend/tests/integration/evidence-staging-gc.spec.ts` — staging >24 h sin fila purgado; en-vuelo conservado; blob superado purgado; vigente intacto (FR-024).
- [x] T039 [P] [US3] Integration test `backend/tests/integration/evidence-retention-purge.spec.ts` — closed >90 d: blob ausente físicamente; acceso a closed → 404 (nunca 410) (FR-018/SC-006).

### Implementación

- [x] T040 [US3] Redacción de PII en logs para los nuevos flujos (object_ref/firma/binario nunca): revisar logger en `upload-evidence.ts`/`get-evidence.ts` y helper de redacción común (FR-008).
- [x] T041 [US3] Auditoría de lectura append-only en `get-evidence.ts` (actor/orderId/evidenceId/timestamp, sin binario) — tabla nueva `EvidenceReadAudit` (append-only, separada de `OrderAudit` para no contaminar su semántica FSM); señal best-effort de accesos denegados heredada del patrón de `getOrderDetail` (FR-021/#009).
- [x] T042 [P] [US3] Job GC `backend/src/infra/storage/gc-job.ts` (FR-024): purga blobs sin fila vigente (staged >TTL, huérfanos, superados); corre ≥ a diario; nunca toca blob de fila vigente.
- [x] T043 [P] [US3] Job retención `backend/src/infra/storage/retention-job.ts` (FR-018): closed >90 d → purga física; latencia ≤24 h; independiente del GC.
- [x] T044 [US3] Registrar/programar ambos jobs (`backend/src/infra/storage/schedule-jobs.ts`, invocado desde `main.ts`) y su config; documentar disparo.

**Checkpoint**: los tres SC de seguridad (SC-003/004/005) y la retención (SC-006) verdes.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T045 [P] Test de arquitectura `backend/tests/arch/` — el dominio no importa `node:crypto`/fs/Express en los nuevos módulos (Principio III).
- [x] T046 [P] Front a11y: `alt` descriptivo, foco y `prefers-reduced-motion` en la apertura de imagen (`OrderDetailView.tsx`); axe verde.
- [x] T047 [P] Actualizar `docs/traceability.md` con el mapa RF→endpoint→tarea→test de la 024.
- [x] T048 Ejecutar validación de `specs/024-evidence-binary-signed-url/quickstart.md` (escenarios 1–4) end-to-end.
- [x] T049 Verificar cobertura (dominio/servicios ≥80%, contratos/transiciones 100%) y `tsc/eslint/vitest` verdes; 0 regresiones (SC-007).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: sin dependencias.
- **Foundational (P2)**: depende de Setup; **BLOQUEA** todas las historias (StoragePort).
- **US1/US2/US3 (P3–P5)**: dependen de Foundational. US2 consume filas creadas por US1 (para test end-to-end de lectura conviene US1 antes, aunque el handler de US2 es independiente). US3 endurece y añade jobs sobre US1/US2.
- **Polish (P6)**: tras las historias deseadas.

### Within Each User Story

- Tests (Red) MUST fallar antes de implementar.
- Dominio (`evidence.ts`) → handlers → rutas → repo/transacción.
- US1: T018 antes de T019/T021; T021 depende del repo transaccional existente.

### Parallel Opportunities

- Setup: T002/T003 [P]; T004→T005 secuencial (regen depende del contrato).
- Foundational: T006 y T008 [P] (rojo); T007 antes de T009; fake (T010) [P] con adaptador.
- Todos los tests marcados [P] de cada historia corren en paralelo (ficheros distintos).
- US3: T042 y T043 [P] (jobs en ficheros distintos).

---

## Implementation Strategy

### MVP (US1 + US2)

1. Setup (P1) → Foundational (P2, StoragePort).
2. US1 (subir + submit) → validar independiente.
3. US2 (abrir imagen) → validar independiente. **MVP de producto: se puede abrir la foto.**
4. US3 endurece seguridad/privacidad y añade jobs de purga (obligatorio para cerrar la feature: PII).
5. Polish → quickstart + cobertura.

### Notas

- Commit por tarea o grupo lógico; **commit del test en rojo antes de implementar** (TDD).
- `submitOrderExecution` NO cambia su cuerpo (contrato): la subida es endpoint aparte.
- El `id` (uuid) de `OrderEvidence` ES el `evidence_id` público (sin campo nuevo → sin migración Prisma).
- Evitar dependencias cruzadas que rompan la testeabilidad independiente de cada historia.
