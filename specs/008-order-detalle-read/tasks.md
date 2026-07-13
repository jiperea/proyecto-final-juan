# Tasks: Detalle de orden (read-side) — #010 (008)

**Branch**: `008-order-detalle-read` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Input**: plan read-side puro (XV). **1 endpoint** `getOrderDetail` (`GET /orders/{orderId}`). **Sin migración**
(solo SELECTs sobre `orders`/`order_audit`/`order_evidence`/`order_execution_notes`). Reutiliza auth/RBAC de 001,
visibilidad de 002a, `pii-redactor` de 007, patrón de auditoría append-only. 001/002a/004/005/006/007 **inamovibles**.

## Format: `[ID] [P?] [Story] Description`

- **[P]** = paralelizable (fichero distinto, sin dependencia pendiente).
- **[US1]** El técnico ve su detalle + el motivo del rechazo (P1, 🎯 MVP) · **[US2]** Supervisor y dispatcher ven el
  detalle según su alcance (P2). RBAC/no-enumeración/PII/auditoría (FR-004/006/009) son **transversales** →
  cubiertos por tests en US1/US2 y en Polish.
- **TDD fase Red**: los tests marcados "(Red)" se **commitean en rojo** antes de implementar (Constitution VII).
- Un endpoint sirve los 3 roles: US1 construye el pipeline (camino del technician dueño, incl. motivo) y US2
  **extiende** el mismo `get-order-detail.ts`/ensamblador con las ramas supervisor (notas+evidencia) y dispatcher
  (mínimo privilegio). Cada US es demostrable de forma independiente.

---

## Phase 1: Setup

- [ ] T001 Verificar rama `008-order-detalle-read`, BD de test arriba (`docker compose up -d db-test`, puerto 5433) y `npm run test` de 001/002/004/005/006/007 en verde (baseline de no-regresión). **Sin migración nueva en #010.**
- [ ] T002 Confirmar que `contracts/orders.openapi.yaml` (v1.5.0) incluye `getOrderDetail` (200/401/404/500/503, **sin 403**) + esquemas `OrderDetailResponse` y `EvidenceMeta`, que el YAML es válido y que `tsc`/`npm run build` compilan.

---

## Phase 2: Foundational (Blocking) ⚠️ bloquea US1 y US2

- [ ] T003 [P] Derivar del contrato los tipos/DTO de salida `OrderDetailResponse`/`EvidenceMeta` (`snake_case` externo) y los tipos internos (`camelCase`) en `backend/src/handlers/orders/order-detail-types.ts` (sin lógica).
- [ ] T004 [P] Definir puertos del dominio en `backend/src/domain/order/read-side/ports.ts`: `OrderDetailReaderPort` (snapshot: order + última reject + último submit + notas/evidencia del ciclo vigente), `PiiRedactorPort` (reusa `domain/ai/pii-redactor` de 007), `DeniedAccessAuditPort` (registro append-only 401/404).
- [ ] T005 Registrar la ruta `GET /v1/orders/:orderId` en el router de orders (`backend/src/handlers/orders/routes.ts`) apuntando a `get-order-detail.ts` (esqueleto), detrás del middleware de auth de 001. **Sin** validación que emita 400 por `orderId` (se resuelve a 404).
- [ ] T006 [P] Implementar el adaptador de auditoría de accesos denegados `backend/src/infra/audit/denied-access-audit.ts` (append-only; `recurso` saneado: UUID → tal cual, si no → `"<malformed>"`; best-effort no bloqueante; loguea fallo con recurso saneado) — FR-009.

---

## Phase 3: User Story 1 — El técnico ve su detalle y el motivo del rechazo (Priority: P1) 🎯 MVP

**Goal**: un technician dueño obtiene `200` con estado + notas/evidencia del ciclo vigente + motivo del último
rechazo **sin atender** (saneado, fail-closed); sobre orden ajena/malformada → `404`.

**Independent test**: escenarios 1–4, 8–9, 11–12, 14 de [quickstart.md](./quickstart.md).

### Tests for User Story 1 (Red) ⚠️

- [ ] T007 [P] [US1] (Red) Unit dominio de visibilidad del technician en `backend/tests/unit/order-detail-visibility.spec.ts`: dueño ve assigned/in_progress/pending_review; ajena/`draft`/`closed`/otro-técnico → no visible (404). 
- [ ] T008 [P] [US1] (Red) Unit de ciclo vigente + "rechazo sin atender" en `backend/tests/unit/rejection-reason.spec.ts`: última reject (`pending_review→in_progress`) posterior al último submit → mostrar; ya reenviada → omitir; multi-ciclo elige la última; empate `at` por uuid v7; `reason` nunca NULL (006).
- [ ] T009 [P] [US1] (Red) Unit del ensamblador (technician) + fail-closed del redactor en `backend/tests/unit/order-detail-assembler.spec.ts`: motivo saneado presente; si el `PiiRedactorPort` lanza/está KO → clave `last_rejection_reason` **omitida** (nunca crudo); `count==content_types.length`; sin ciclo → `evidence {count:0,content_types:[]}`.
- [ ] T010 [P] [US1] (Red) Contract test de `getOrderDetail` en `backend/tests/contract/get-order-detail.contract.spec.ts`: 200 conforme a `OrderDetailResponse` (technician con motivo); `evidence`/`notes`/`last_rejection_reason` opcionales; 401/404/500/503; **nunca 403**.
- [ ] T011 [P] [US1] (Red) Integración (BD real) en `backend/tests/integration/get-order-detail.technician.spec.ts`: escenarios 1–4, 9, 11 (propia rechazada, ya reenviada, sin ciclo, ajena→404, malformado→404, multi-ciclo).

### Implementation for User Story 1

- [ ] T012 [P] [US1] Implementar visibilidad por rol (technician) en `backend/src/domain/order/read-side/order-detail-visibility.ts` (rol + `assigned_to==actor` + estado en alcance → visible|404; puro).
- [ ] T013 [P] [US1] Implementar resolución de ciclo vigente en `backend/src/domain/order/read-side/current-cycle.ts` (`audit_id` del último submit `execution_registered`; filtra notas/evidencia; `content_types` ordenado por `at` asc; `count==length`).
- [ ] T014 [US1] Implementar la regla "rechazo sin atender" en `backend/src/domain/order/read-side/rejection-reason.ts` (última reject vs último submit; desempate uuid v7) (depende de T013).
- [ ] T015 [US1] Implementar el ensamblador del DTO (rama technician) en `backend/src/domain/order/read-side/order-detail-assembler.ts`: invoca `PiiRedactorPort` **fail-closed** sobre el motivo; omite claves ausentes (depende de T012–T014).
- [ ] T016 [US1] Implementar el reader `infra` en `backend/src/infra/prisma/order-detail-reader.ts`: **snapshot consistente** (`$transaction`) con guard de propiedad + última reject + último submit + notas/evidencia del ciclo; BD KO → 503 (implementa `OrderDetailReaderPort`).
- [ ] T017 [US1] Implementar el handler `backend/src/handlers/orders/get-order-detail.ts` (rama technician): precedencia **401→404**; `orderId` malformado → 404; mapeo de errores `{code,message,details,agent_action}`; invoca `DeniedAccessAuditPort` en 401/404; ensambla vía dominio (depende de T015, T016, T006).
- [ ] T018 [US1] Verificar T007–T011 en verde (Green) y no-regresión de 001/002/004/005/006/007.

---

## Phase 4: User Story 2 — Supervisor y dispatcher ven el detalle según su alcance (Priority: P2)

**Goal**: supervisor (orden en `pending_review`) ve order+notas+evidencia (sin motivo); dispatcher
(`assigned`/`in_progress`) ve solo campos de la orden (sin notas/evidencia/motivo); fuera de alcance → `404`.

**Independent test**: escenarios 5–7, 10, 13 de [quickstart.md](./quickstart.md).

### Tests for User Story 2 (Red) ⚠️

- [ ] T019 [P] [US2] (Red) Unit de visibilidad supervisor/dispatcher + rol-no-reconocido en `backend/tests/unit/order-detail-visibility.supervisor-dispatcher.spec.ts`: supervisor solo `pending_review`; dispatcher solo `assigned`/`in_progress`; rol desconocido → alcance vacío → 404.
- [ ] T020 [P] [US2] (Red) Unit del ensamblador por rol en `backend/tests/unit/order-detail-assembler.roles.spec.ts`: supervisor con notes+evidence sin motivo; dispatcher **sin** notes/evidence/motivo.
- [ ] T021 [P] [US2] (Red) Integración por rol en `backend/tests/integration/get-order-detail.roles.spec.ts`: escenarios 5–7, 10, 13 (supervisor 200, dispatcher 200 mínimo, draft/closed→404, rol raro→404, reasignación: nuevo dueño ve ciclo anterior + ex-dueño→404).

### Implementation for User Story 2

- [ ] T022 [US2] Extender la visibilidad por rol en `order-detail-visibility.ts` (supervisor `pending_review`; dispatcher `assigned`/`in_progress`; rol no reconocido → vacío→404) (depende de T012).
- [ ] T023 [US2] Extender el ensamblador con las ramas supervisor (notes+evidence, sin motivo) y dispatcher (mínimo privilegio) en `order-detail-assembler.ts` (depende de T015).
- [ ] T024 [US2] Ampliar el handler para los 3 roles (una sola ruta) en `get-order-detail.ts` (depende de T017, T022, T023).
- [ ] T025 [US2] Verificar T019–T021 en verde (Green) y no-regresión.

---

## Phase 5: Polish & Cross-Cutting (FR-004/006/009, SC-003/004, arquitectura)

- [ ] T026 [P] (Red→Green) Test de no-enumeración/precedencia en `backend/tests/integration/get-order-detail.no-enumeration.spec.ts`: 401 (sin token, incl. id malformado) precede a 404; ramas de 404 con **mismo código y cuerpo** (inexistente/ajena/fuera-de-estado/malformado); nunca 403.
- [ ] T027 [P] (Red→Green) Test de auditoría de accesos denegados en `backend/tests/integration/get-order-detail.denied-audit.spec.ts`: cada 401/404 escribe registro append-only con `recurso` saneado (UUID o `<malformed>`); fallo de auditoría no bloquea la respuesta (FR-009).
- [ ] T028 [P] (Red→Green) Test de no-fuga de PII (SC-004) en `backend/tests/integration/get-order-detail.pii.spec.ts`: **0** `object_ref` en cuerpo (todo rol); **0** PII estructural en el motivo; `reason` crudo **0** en logs (`REDACT_PATHS`).
- [ ] T029 [P] (Red→Green) Test de concurrencia (snapshot) en `backend/tests/integration/get-order-detail.snapshot.spec.ts`: GET vs `submitOrderExecution`/reasignación en vuelo → motivo+notas del mismo ciclo; ex-dueño no obtiene el motivo tras reasignación concurrente.
- [ ] T030 [P] Arch test read-only en `backend/tests/unit/arch/get-order-detail-read-only.spec.ts`: el handler/dominio de #010 **no** importa write-side ni muta `status`/`version`.
- [ ] T031 Actualizar `docs/traceability.md` (FR-001..FR-009 → `getOrderDetail` → T0xx → tests).
- [ ] T032 Verificar cobertura (dominio ≥80%, servicios ≥80%, 100% contrato y ramas de visibilidad/404), `tsc`/`eslint` limpios, y ejecutar los 17 escenarios de `quickstart.md`.

---

## Dependencies & Order

- **Setup (T001–T002)** → **Foundational (T003–T006)** → **US1 (T007–T018, MVP)** → **US2 (T019–T025)** → **Polish (T026–T032)**.
- US2 depende de US1 (extiende visibilidad/ensamblador/handler). Polish depende de US1+US2.
- **Paralelizables [P]**: dentro de cada fase, los tests entre sí y los módulos de dominio en ficheros distintos (T007–T011; T012/T013; T019–T021; T026–T030).

## Parallel example (US1 tests, fase Red)

```
# Lanzar en paralelo (ficheros distintos), commitear en rojo antes de implementar:
T007 order-detail-visibility.spec.ts
T008 rejection-reason.spec.ts
T009 order-detail-assembler.spec.ts
T010 get-order-detail.contract.spec.ts
T011 get-order-detail.technician.spec.ts
```

## MVP scope

**US1 (T001–T018)**: el technician ve su detalle + motivo del rechazo — desbloquea FE-1/FE-2 de la Front. US2
añade supervisor/dispatcher (FE-3/FE-4). Polish cierra RBAC/PII/auditoría transversales para G3.
