# Implementation Plan: Revisión por el supervisor (MAGRO)

**Branch**: `006-revision-supervisor` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md) (G1 PASS, remediada)

**Input**: spec magra (needs-first, XV). Sólo las **dos decisiones del supervisor** (write-side) sobre una orden
ya en `pending_review`. Lectura de detalle (#010), transporte binario (#007), endurecimiento write-side (#008)
y auditoría forense de accesos (#009) quedan fuera. 001/002a/002b/004/005 **inamovibles**.

## Summary

Un endpoint HTTP para el **supervisor**: `reviewOrder` (`POST /v1/orders/{orderId}/review`) con body
`{ decision: approve|reject, reason? }`. **approve** → `pending_review→closed` (con guard defensivo
existencia de ≥1 evidencia exigida **dentro del UPDATE condicional** vía filtro de relación `evidence:{some:{}}`, o `409 EVIDENCE_MISSING`); **reject** → `pending_review→in_progress` con **motivo
obligatorio**. Todo en **una transacción atómica** con auditoría append-only (`OrderAudit.reason` = motivo
pre-saneado, nunca las notas). RBAC **sólo-supervisor** + estado de origen `pending_review`, con **precedencia
determinista única** (`401→403→422(VALIDATION_ERROR)→422(INVALID_REASON)→404(no visible)→409(evidencia)`). La
evidencia y notas de 005 se **conservan intactas**. Reutiliza `OrderAudit`, el **patrón atómico/append-only** y
la **FSM** de 002b/003, y el auth/RBAC de 001; la **clasificación 404 post-0-filas** usa un **puerto propio** de
006 (visibilidad state-scoped `pending_review`), **no** `applyTransition`/`classifyZeroRows` de 002b (intactos).

## Technical Context

**Language/Version**: TypeScript 5 (`^5.5.4`, `strict`) · Node 18+ (Docker).
**Primary Dependencies**: Express 4 (`^4.19.2`), Prisma/`@prisma/client` `^5.18.0` (PostgreSQL 16,
`$transaction` interactiva), Zod `^3.23.8`, `pino ^9.3.2`, `jsonwebtoken ^9.0.2` (auth de 001), `uuid ^10.0.0`.
**Storage**: PostgreSQL 16 vía Docker Compose (BD de test `fieldops_test`, `db-test`, puerto 5433, tmpfs).
**Sin migración Prisma**: no hay tablas ni columnas nuevas. Reutiliza `orders`, `order_audit` (append-only) y
comprueba la existencia de evidencia (filtro de relación en el UPDATE) — todas ya existen (002b/005).
**Testing**: Vitest `^2.0.5` (unit dominio sin BD) · Supertest `^7.0.0` (integración + contract). Sin IA →
sin promptfoo.
**Target Platform**: Servicio HTTP Linux (contenedor). **Project Type**: web service hexagonal (solo `backend/`).
**Performance Goals**: p95 < 300 ms medido **por separado** para approve y reject (50 peticiones secuenciales,
BD caliente, warm-up descartado, nearest-rank) — SC-006.
**Constraints**: `status`/`version` **sólo** mutan desde `domain/order/write-side/` (arch test); `OrderAudit`
append-only (trigger); **motivo (`reason`) pre-saneado, nunca en logs/errores**; atomicidad todo-o-nada
(transición + auditoría); no-enumeración por cuerpo (estado `pending_review` = visibilidad → 404 genérico);
actor server-side (FR-012); guard de evidencia fail-closed **dentro del UPDATE** (FR-013 → 409, tras 404) — el
`updateMany` con `evidence:{some:{}}` DEBE compilar a **una sola sentencia atómica** `UPDATE … WHERE … AND
EXISTS(…)` (verificar SQL en test; **fallback** `$executeRaw` si Prisma no lo compilara atómico); `$transaction`
en aislamiento por defecto (READ COMMITTED) con re-lectura dentro de la misma tx; clasificador con rama
**por-defecto fail-safe 404** (nunca 500/fuga);
longitud del motivo **1..1000 medida tras `sanitizeReason` en dominio** (Zod sólo cota cruda ≤4000); error de BD
no transitorio → 500, BD no disponible → 503. **Sin** If-Match/409-optimista, lectura de detalle, ni cifrado at-rest de `reason`
(diferidos a #008/#010/BL-051).
**Scale/Scope**: 1 endpoint, 13 FR, 6 SC, 0 entidades nuevas, 0 migraciones.

## Constitution Check

*GATE: pasa antes de Phase 0 y se re-comprueba tras Phase 1.*

### Gate · Contract-First (II)
- [x] Se **extiende** `contracts/orders.openapi.yaml` (v1.3.0) con `reviewOrder`
  (200/401/403/404/409/422/500/503) + schema `ReviewRequest`, **antes** del código (hecho en Phase 1; Spectral OK).
- [x] Zod derivado del contrato, `.strict()`; `snake_case` externo / `camelCase` interno; conteo por code points.
- [x] Cada `operationId` × código de respuesta con contract test.

### Gate · RBAC y seguridad (IV, IX, XI)
- [x] `requireRole('supervisor')` + estado de origen `pending_review` en el UPDATE condicional. Precedencia única
  `401→403→422(VALIDATION_ERROR: decision/body)→422(INVALID_REASON: motivo)→404(no visible)→409(evidencia)`.
  El **payload se valida primero** (no revela nada del recurso). **(G2/K1)** En **approve**, la existencia de
  evidencia va **dentro** del UPDATE condicional como filtro de relación (`evidence:{ some:{} }`), **no** como
  `COUNT` previo (un COUNT antepondría 409 a 404 → fuga de no-enumeración). Si 0 filas, el **clasificador propio**
  (`classify-review-guard.ts`) re-clasifica **post-0-filas** desde el snapshot `{status, evidenceCount}` (re-lee,
  sin SELECT previo → sin TOCTOU) con **404 antes que 409**: `status≠pending_review`/inexistente → 404;
  `pending_review` + `evidenceCount=0` → 409 EVIDENCE_MISSING. En **reject** el UPDATE keyea sólo
  `status='pending_review'`. NO toca `classifyZeroRows` de 002b. **Sin** predicado de `version` →
  `VERSION_CONFLICT`/409-optimista **no surge** (reservado a #008); `version` se incrementa. Actor sólo del token
  (FR-012).
- [x] 401/403/404/409/422/500/503 distinguidos; no-enumeración 404 genérico (estado = visibilidad). Motivo no-fuga
  (FR-008): grep negativo en logs y cuerpos de error.
- [x] **Constitution XI**: `OrderAudit.reason` = motivo **pre-saneado por 006** (`sanitizeReason`), es el motivo
  de la transición (no PII de notas); auditoría append-only atómica. Evidencia/notas de 005 intactas (FR-005).
- [~] **Desviación IX (cifrado en reposo de `OrderAudit.reason`)**: diferida a **BL-051** (infra transversal) —
  ver Complexity Tracking. El saneo + no-fuga (no excepcionable) se hace ya.
- [~] **Desviación XI (registro forense de accesos denegados 401/403/404)**: diferida a **#009 (BL-002/067)**.
- [~] **Desviación X (robustez/concurrencia — sin `If-Match`/409-optimista)**: el 409-optimista se difiere a
  **#008 (BL-001)**; el doble-clic/carrera es **404 fail-safe** (UPDATE condicional). El `409 EVIDENCE_MISSING`
  de FR-013 es un guard de **integridad** (distinto del 409-optimista de #008).
- [~] **Deuda #010 (lectura del motivo por el technician + read-side)**: fuera de 006 (write-only); requiere
  enmienda de Constitution XI — trazada en el roadmap (BL-070). Ver Complexity Tracking.

### Gate · Arquitectura Hexagonal (III)
- [x] `domain/order/write-side/review-order.ts` puro (valida `decision`, sanea/valida `reason`, decide estado
  destino; no importa Express/Prisma); `infra/repositories/order-write-side-repository.ts` con `$transaction`.
  Handler delgado. Puertos inyectados.
- [x] **Test de arquitectura**: `status`/`version` sólo se escriben desde el módulo write-side (extendido).
- [~] **(G2/K4) Invariante write-side = carpeta, no función**: 003 FR-006 redactó el invariante como "única
  función `applyTransition`", pero 005 y 006 escriben estado desde su propio módulo en `domain/order/write-side/*`
  (+ `order-write-side-repository.ts`) sin `applyTransition`. El invariante **real y verificado** (arch test) es
  **"carpeta única write-side"**. Reconciliar la redacción de 003 FR-006 = **backlog BL-071** (no bloqueante;
  precedente sentado por 005). Implicación para #008: la concurrencia optimista `If-Match`/409 deberá reforzarse
  en **cada** ruta write-side (incl. `reviewOrder`), no sólo en `applyTransition`.

### Gate · Calidad y verificación (V, VI, VII, XIII, XIV)
- [x] FRs en EARS; trazabilidad RF→endpoint→tarea→test (docs/traceability.md, Polish).
- [x] TDD fase Red (commit de test en rojo); cobertura dominio ≥80%, handlers/servicios ≥80%.
- [x] SC medibles (Vitest+Supertest, Postgres real; sin IA → sin promptfoo, N/A). Gates G1 (PASS)/G2/G3, 0 bloqueantes.

**Resultado**: PASS (**4** desviaciones diferidas y trazadas —cifrado at-rest de `reason` (IX/BL-051), forense de
accesos (XI/#009), If-Match/409-optimista (X/#008), read-side + enmienda XI (#010/BL-070)—, ninguna de seguridad
no-excepcionable; el saneo/no-fuga del motivo, la separación motivo↔notas y el guard de evidencia sí se hacen ya).

## Project Structure

### Documentation (this feature)

```text
specs/006-revision-supervisor/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/            # (el contrato canónico es contracts/orders.openapi.yaml, extendido a v1.3.0)
├── checklists/requirements.md · gates/gate-G1-*
└── tasks.md              # /speckit-tasks (aún no)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── domain/order/
│   │   ├── write-side/
│   │   │   ├── apply-transition.ts         # de 002b, INTACTO — NO invocado por reviewOrder de 006
│   │   │   ├── classify-review-guard.ts     # NUEVO (006): clasifica POST-0-filas (re-lee, sin SELECT previo →
│   │   │   │                                 #   sin TOCTOU): visibilidad pending_review → 404; en approve, guard
│   │   │   │                                 #   evidenceCount=0 (approve) → 409 EVIDENCE_MISSING; default→404 fail-safe. NO toca 002b.
│   │   │   ├── review-order.ts              # NUEVO (006): dominio puro — valida decision, sanea/valida reason
│   │   │   │                                 #   (sanitizeReason), decide estado destino (approve→closed |
│   │   │   │                                 #   reject→in_progress), delega en el puerto. NO usa applyTransition.
│   │   │   ├── sanitize-reason.ts           # NUEVO (006): sanitizeReason() puro (trim+colapso+strip Cc+NFC)
│   │   │   └── write-side-ports.ts          # +ReviewOrderPort (atómico) + errores de 006
│   │   ├── transition-table.ts             # REUTILIZADO (pending_review→closed y →in_progress ya legales)
│   │   └── model.ts
│   ├── handlers/
│   │   ├── orders/review.ts                 # NUEVO handler DELGADO (auth→requireRole('supervisor')→body(Zod)→
│   │   │                                     #   dominio→map). Actor del token (FR-012).
│   │   ├── contract/{schemas,order-types}.ts    # +reviewRequestSchema (Zod: decision enum + reason condicional)
│   │   ├── error-mapper.ts                   # +INVALID_REASON/VALIDATION_ERROR→422, EVIDENCE_MISSING→409,
│   │   │                                     #   ACTOR_INVALID/constraint→500, BD no disponible→503
│   │   └── app.ts                            # monta POST .../review con authenticate+requireRole('supervisor')
│   └── infra/repositories/
│       └── order-write-side-repository.ts   # +reviewOrder: 1 $transaction (UPDATE condicional status=
│                                             #   pending_review [approve: + evidence:{some:{}} en el WHERE] + OrderAudit)
├── prisma/                                   # SIN cambios (sin migración)
└── tests/{contract,integration,unit}/
contracts/orders.openapi.yaml                 # +reviewOrder, +ReviewRequest (v1.3.0)
```

**Structure Decision**: web service hexagonal (`backend/`), reutilizando el módulo write-side de 002b/004/005.
La escritura de estado sigue confinada a `domain/order/write-side/` + `infra/repositories/order-write-side-repository.ts`
(arch test). La validación de `decision`/`reason` y el saneo son **dominio puro** (testeable sin BD). La lógica de
existencia de evidencia (filtro de relación en el UPDATE condicional) vive en el repositorio dentro de la misma transacción (integridad atómica del guard FR-013).

## Complexity Tracking

| Desviación | Por qué se necesita | Por qué la alternativa simple se rechaza |
|---|---|---|
| Cifrado en reposo de `OrderAudit.reason` **diferido** a BL-051 | XV: el MVP fija el saneo + no-fuga (no excepcionable, XI) y deja el cifrado at-rest como deuda transversal ya trazada (IX). | Implementar cifrado app-level aquí sobredimensiona una feature de una acción; BL-051 ya lo cubre para toda la columna `reason`. |
| Registro forense de **accesos denegados** (401/403/404) **diferido** a #009 | XV: cluster de gobernanza transversal (XI ampliado), no del núcleo de revisión. | Embeberlo repite el sobredimensionado; ya es feature propia #009 (BL-002/067). |
| **Sin** `If-Match`/409-optimista | El UPDATE condicional atómico (`status='pending_review'` en WHERE) ya hace fail-safe el doble-clic/carrera entre supervisores (→404). | La semántica `409`/`If-Match` es endurecimiento (#008), no requisito del MVP funcional. Distinto del `409 EVIDENCE_MISSING` (guard de integridad) que sí se hace. |
| **Lectura del motivo por el technician + read-side** diferida a #010 (BL-070) | XV: 006 es write-only; exponer lectura exige un backend read-side y **enmienda de Constitution XI** (technician lee su propio motivo), fuera del alcance de una feature de escritura. | Ampliar 006 con lectura reabriría G1 y forzaría una enmienda de principio desde una feature de negocio; se traza como feature propia antes de FE-1. |
| **(G2/K4)** Reconciliar 003 FR-006 (invariante write-side = carpeta, no función) = **BL-071** | 005/006 escriben estado sin `applyTransition`; el arch test verifica carpeta. La redacción de 003 quedó desalineada con el diseño real (deuda documental). | Amendar 003 ahora (spec merged) es más costoso que trazar el desajuste; el invariante efectivo ya está cubierto por el arch test de 005/006. |
