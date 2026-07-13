# Implementation Plan: Registro de ejecución por el técnico (MAGRO)

**Branch**: `005-registro-ejecucion` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md) (G1 PASS, remediada)

**Input**: spec magra (needs-first, XV). Sólo las dos acciones del técnico + validación de evidencia **por
referencia**. Transporte binario (#007), endurecimiento write-side (#008) y auditoría forense (#009) quedan
fuera. 001/002a/002b/004 **inamovibles**.

## Summary

Dos endpoints HTTP para el **technician** sobre **su propia** orden: `startOrderWork`
(`POST /v1/orders/{orderId}/start`, `assigned→in_progress`) y `submitOrderExecution`
(`POST /v1/orders/{orderId}/execution`, `in_progress→pending_review`) adjuntando **≥1 evidencia válida por
referencia** y **notas**. Todo en **una transacción atómica** con auditoría append-only. RBAC technician +
pertenencia con **precedencia determinista única** (`401→403→422 payload→404 pertenencia→422 estado`), notas
persistidas **fuera** de la auditoría (entidad `OrderExecutionNotes`, payload PII, Constitution IX/XI), errores
saneados (500). Reutiliza `OrderAudit`, el **patrón atómico/append-only** y la **FSM** de 002b, y el auth/RBAC de
001; pero la **clasificación 404-vs-422** y la escritura de estado de 005 usan un **puerto propio**
(pertenencia-antes-que-estado), **no** `applyTransition`/`classifyZeroRows` de 002b (que quedan intactos).

## Technical Context

**Language/Version**: TypeScript 5 (`^5.5.4`, `strict`) · Node 18+ (Docker).
**Primary Dependencies**: Express 4 (`^4.19.2`), Prisma/`@prisma/client` `^5.18.0` (PostgreSQL 16,
`$transaction` interactiva), Zod `^3.23.8`, `pino ^9.3.2`, `jsonwebtoken ^9.0.2` (auth de 001), `uuid ^10.0.0`.
**Storage**: PostgreSQL 16 vía Docker Compose (BD de test `fieldops_test`, `db-test`, puerto 5433, tmpfs).
Migración Prisma **aditiva**: nuevas tablas `order_evidence` (+trigger append-only) y `order_execution_notes`;
sin ALTER sobre `orders`/`order_audit`.
**Testing**: Vitest `^2.0.5` (unit dominio sin BD) · Supertest `^7.0.0` (integración + contract). Sin IA →
sin promptfoo.
**Target Platform**: Servicio HTTP Linux (contenedor). **Project Type**: web service hexagonal (solo `backend/`).
**Performance Goals**: p95 < 300 ms (50 peticiones secuenciales, BD caliente, warm-up descartado, nearest-rank).
**Constraints**: `status`/`version` **sólo** mutan desde `domain/order/write-side/` (arch test); `OrderAudit`/
`OrderEvidence` append-only (trigger); `OrderExecutionNotes` mutable/purgable (IX); **notas y `object_ref` nunca
en logs/errores**; `reason` = marcador opaco (nunca el texto de notas — XI); atomicidad todo-o-nada (incl. notas);
no-enumeración por cuerpo (pertenencia antes que estado); actor server-side; errores de BD → 500 genérico. **Sin**
If-Match/409, transporte binario, ni cifrado/purga automatizada de notas (diferidos a #007/#008/backlog).
**Scale/Scope**: 2 endpoints, 8 FR, 9 SC, 2 entidades nuevas, 1 migración aditiva.

## Constitution Check

*GATE: pasa antes de Phase 0 y se re-comprueba tras Phase 1.*

### Gate · Contract-First (II)
- [x] Se **extiende** `contracts/orders.openapi.yaml` con `startOrderWork` y `submitOrderExecution`
  (200/401/403/404/422/500) + schemas `ExecutionRequest`/`EvidenceRef`, **antes** del código (hecho en Phase 1).
- [x] Zod derivado del contrato, `.strict()`; `snake_case` externo / `camelCase` interno; conteo por code points.
- [x] Cada `operationId` × código de respuesta con contract test.

### Gate · RBAC y seguridad (IV, IX, XI)
- [x] `requireRole('technician')` + pertenencia (`assigned_to == actor`) + estado de origen en el UPDATE
  condicional. Precedencia única `401→403→422(payload)→404(pertenencia)→422(estado)` — el **payload se valida
  primero** (no revela nada del recurso destino); entre los códigos de recurso, un **clasificador propio de 005**
  (`classify-execution-guard.ts`) compartido por `start` y `execution` re-clasifica **post-0-filas** con
  **pertenencia (404) antes que estado (422)** (invertido respecto al `classifyZeroRows` de 002b, que NO se toca).
  El UPDATE keyea `status`+`assigned_to` (**sin** predicado de `version`) → **`VERSION_CONFLICT` no surge en 005**
  (409 reservado a #008); `version` se incrementa pero no guarda. Actor sólo del token (FR-007).
- [x] 401/403/404/422/500 distinguidos; no-enumeración 404 genérico (pertenencia antes que estado). Notas y
  `object_ref` no-fuga (FR-005): grep negativo en logs y cuerpos de error.
- [x] **Constitution XI**: `OrderAudit.reason` = marcador opaco constante (sin PII); auditoría append-only
  atómica. **Notas fuera de la auditoría** en `OrderExecutionNotes` (payload PII, IX).
- [~] **Desviación IX (cifrado en reposo/purga automatizada de `OrderExecutionNotes.notes`)**: diferida a un
  ítem de backlog propio — ver Complexity Tracking. La **separación estructural** (no excepcionable, XI) se hace ya.
- [~] **Desviación XI (registro forense de accesos denegados)**: diferida a **#009 (BL-002/067)** — ver
  Complexity Tracking.
- [~] **Desviación X (robustez/concurrencia — sin `If-Match`/409)**: el `409` de cara al cliente se difiere a
  **#008 (BL-001)**; en el MVP el desajuste de versión es **404 fail-safe**. La atomicidad/fail-safe base (UPDATE
  condicional) sí se cumple aquí — ver Complexity Tracking.

### Gate · Arquitectura Hexagonal (III)
- [x] `domain/order/write-side/submit-execution.ts` puro (valida evidencia/notas; no importa Express/Prisma);
  `infra/repositories/order-write-side-repository.ts` con `$transaction`. Handlers delgados. Puertos inyectados.
- [x] **Test de arquitectura**: `status`/`version` sólo se escriben desde el módulo write-side (extendido).

### Gate · Calidad y verificación (V, VI, VII, XIII, XIV)
- [x] FRs en EARS; trazabilidad RF→endpoint→tarea→test (docs/traceability.md, Polish).
- [x] TDD fase Red (commit de test en rojo); cobertura dominio ≥80%, handlers/servicios ≥80%.
- [x] SC medibles (Vitest+Supertest, Postgres real; sin IA → sin promptfoo, N/A). Gates G1 (PASS)/G2/G3, 0 bloqueantes.

**Resultado**: PASS (**3** desviaciones diferidas y trazadas —cifrado/purga de notas (IX), forense de accesos
(XI), If-Match/409 (X)—, ninguna de seguridad no-excepcionable; la separación estructural PII/auditoría sí se hace ya).

## Project Structure

### Documentation (this feature)

```text
specs/005-registro-ejecucion/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/            # (el contrato canónico es contracts/orders.openapi.yaml, extendido)
├── checklists/requirements.md · gates/gate-G1-*
└── tasks.md              # /speckit-tasks (aún no)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── domain/order/
│   │   ├── write-side/
│   │   │   ├── apply-transition.ts        # de 002b, INTACTO — NO invocado por start/execution de 005
│   │   │   ├── classify-execution-guard.ts # NUEVO (Foundational, compartido start+execution): clasificador
│   │   │   │                              #   propio de 005. Re-clasifica POST-0-filas (re-lee, como 002b, sin
│   │   │   │                              #   SELECT previo → sin TOCTOU) con orden PERTENENCIA(404)→ESTADO(422)→
│   │   │   │                              #   versión(fail-safe 404). NO altera classifyZeroRows de 002b.
│   │   │   ├── start-order-work.ts        # NUEVO: uso de dominio propio de start (análogo a submit-execution);
│   │   │   │                              #        UPDATE condicional + clasificador T010b. NO usa applyTransition.
│   │   │   ├── submit-execution.ts        # NUEVO: valida evidencia (≥1..10, allowlist, size, object_ref,
│   │   │   │                              #        sin duplicados) + notas (forma); precedencia; delega en puerto
│   │   │   └── write-side-ports.ts        # +StartOrderWorkPort + OrderExecutionPort (atómicos) + errores 005
│   │   ├── evidence.ts                     # NUEVO: reglas puras de validación de EvidenceRef (dominio)
│   │   ├── transition-table.ts             # REUTILIZADO (transiciones ya legales)
│   │   └── model.ts
│   ├── handlers/
│   │   ├── orders/start.ts                 # NUEVO handler DELGADO (auth→requireRole→valida UUID→start-order-work
│   │   │                                   #   con puerto propio + clasificador T010b; NO usa applyTransition p/ clasificar)
│   │   ├── orders/execution.ts             # NUEVO handler DELGADO (auth→requireRole→body(Zod)→dominio→map)
│   │   ├── contract/{schemas,order-types}.ts   # +executionRequestSchema (Zod) + DTOs
│   │   ├── error-mapper.ts                 # +EVIDENCE_REQUIRED/INVALID_EVIDENCE/VALIDATION_ERROR→422; catch-all 500
│   │   └── app.ts                          # monta POST .../start y .../execution con authenticate+requireRole('technician')
│   └── infra/repositories/
│       └── order-write-side-repository.ts  # +submitExecution: 1 $transaction (UPDATE condicional +
│                                           #   OrderAudit reason opaco + OrderEvidence[] + OrderExecutionNotes)
├── prisma/
│   ├── schema.prisma                       # +model OrderEvidence, +model OrderExecutionNotes (aditivo)
│   └── migrations/<ts>_add_order_evidence_and_execution_notes/  # +trigger append-only en order_evidence
└── tests/{contract,integration,unit}/
contracts/orders.openapi.yaml               # +startOrderWork, +submitOrderExecution, +ExecutionRequest/EvidenceRef
```

**Structure Decision**: web service hexagonal (`backend/`), reutilizando el módulo write-side de 002b/004. La
escritura de estado sigue confinada a `domain/order/write-side/` + `infra/repositories/order-write-side-repository.ts`
(arch test). La validación de evidencia/notas es **dominio puro** (testeable sin BD).

## Complexity Tracking

| Desviación | Por qué se necesita | Por qué la alternativa simple se rechaza |
|---|---|---|
| Cifrado en reposo/purga de `OrderExecutionNotes.notes` **diferido** a ítem de backlog | XV (spec magra): el MVP fija la **separación estructural** (XI, no excepcionable) y deja el cifrado/purga automatizada como deuda trazada (IX). | Implementar cifrado app-level + job de purga aquí sobredimensiona la feature (lección 001/XV). BL-051/055 están scoped a `OrderAudit.reason`, no a esta tabla → se crea ítem propio. |
| Registro forense de **accesos denegados** (401/403/404) **diferido** a #009 | XV: es un cluster de gobernanza transversal (XI ampliado), no del núcleo de ejecución. | Embeberlo repetiría el patrón de sobredimensionado; ya es feature propia #009 (BL-002/067). |
| **Sin** `If-Match`/409 (concurrencia optimista de cara al cliente) | El UPDATE condicional atómico (version+guard en WHERE) ya hace fail-safe el doble-clic/reasignación (D3). | La semántica HTTP `409`/`If-Match` es endurecimiento (#008), no requisito del MVP funcional. |
