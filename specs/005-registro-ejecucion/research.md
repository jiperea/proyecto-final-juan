# Research: Registro de ejecución por el técnico (005)

**Fase 0.** Resuelve los valores/decisiones que la spec (magra, XV) difirió explícitamente al plan (M6) y fija
el enfoque técnico sobre lo ya construido en 001/002a/002b/004 (inamovibles). Sin componente IA → sin promptfoo.

## D1 · Valores concretos de validación (spec M6)

**Decisión** (parámetros de validación Zod, derivados del contrato; no números mágicos en código):

| Parámetro | Valor MVP | Racional |
|---|---|---|
| `evidence` — mínimo | **1** | Brief "al menos una foto" (bloqueante, `EVIDENCE_REQUIRED`). |
| `evidence` — máximo | **10** | Cota anti-inflado/DoS (spec Q "p.ej. ≤10"); exceder → `INVALID_EVIDENCE`. |
| `content_type` allowlist | **`image/jpeg`, `image/png`, `image/webp`, `image/heic`** | Formatos de foto de móvil de campo; fuera de lista → `INVALID_EVIDENCE`. |
| `size_bytes` máximo | **26214400 (25 MiB)** | Metadato declarado (no hay binario en el MVP); cap sano para foto de móvil. `size_bytes ≤ 0` o `>` máx → `INVALID_EVIDENCE`. |
| `object_ref` formato | **1..512 code points, sin caracteres de control ni whitespace de borde**; string opaco | Bounded, sin chequear existencia (desacople de #007). Vacío/fuera de rango/control → `INVALID_EVIDENCE`. |
| `object_ref` duplicados | **igualdad exacta** (byte a byte, case-sensitive, sin trim) | Es identificador opaco; normalizar sería adivinar. Duplicado → `INVALID_EVIDENCE`. |
| `notes` longitud | **1..2000 code points**, no vacío/whitespace/control | Notas operativas más ricas que un `reason` de reasignación (004 usó ≤500); ausente/vacío/>máx → `VALIDATION_ERROR`. |

**Alternativas descartadas**: allowlist más amplia (gif/tiff) — innecesaria para foto de ejecución; normalización
de `object_ref` — rompería la opacidad; límite de notas ≤500 — demasiado corto para descripción de incidencia.

## D2 · Atomicidad todo-o-nada con la nueva entidad de notas (spec FR-006)

**Decisión**: `submitOrderExecution` ejecuta en **una sola `$transaction` interactiva** (Prisma), en este orden:
1. **UPDATE condicional atómico** `in_progress→pending_review` con `version` + guard `assigned_to` en el `WHERE`
   (reutiliza el patrón de `order-write-side-repository.ts`, cierra TOCTOU; 0 filas → clasificación
   404/422/`INVALID_TRANSITION`/`GUARD_UNMET`).
2. **Auditoría** (`OrderAudit`, `event_type=transition`) con `reason` = marcador opaco constante
   `"execution_registered"` (nunca el texto de las notas — Constitution XI).
3. **Evidencia** (`OrderEvidence`, ≥1 filas append-only).
4. **Notas** (`OrderExecutionNotes`, 1 fila) con `audit_id` → la auditoría del paso 2 (**enlace unidireccional**;
   no hay ciclo de FKs).

Si **cualquier** paso falla → rollback total (sin orden en `pending_review` sin sus notas/evidencia). `startOrderWork`
reutiliza `applyTransition` tal cual (`assigned→in_progress`, `reason` NULL).

**Racional**: reutiliza la garantía de atomicidad y no-enumeración ya probada en 002b/004; el orden auditoría→notas
resuelve el ciclo FK detectado en G1. **Alternativa descartada**: FK bidireccional `reason↔audit_id` (ciclo,
bloqueante G1); insertar notas fuera de la transacción (best-effort) — violaría FR-006.

## D3 · Concurrencia (spec M7)

**Decisión**: sin `If-Match`/409 de cara al cliente (= #008). El `expectedVersion` que consume el UPDATE
condicional se **deriva server-side** (lectura de la versión vigente en el flujo); el cuerpo del contrato no lleva
versión. El `WHERE` atómico (`version` + `status` origen + `assigned_to`) hace fail-safe el doble-clic y la
reasignación (004) concurrente: sólo una request afecta 1 fila. **Verificado** en
`backend/src/infra/repositories/order-write-side-repository.ts` (patrón existente).

## D4 · PII de notas — cifrado en reposo y purga (spec S-001, Constitution IX)

**Decisión**: `OrderExecutionNotes.notes` es **payload PII** (Constitution IX): columna `text`, **lectura
restringida por RBAC** (supervisor en función de auditoría; nunca technician de otra orden). El **cifrado en
reposo automatizado y la purga por retención** requieren un **ítem de backlog propio** (los existentes
BL-051/055 están scoped a `OrderAudit.reason`); en este MVP se documenta como riesgo residual con el ítem
trazado. La **separación estructural** (reason opaco / notas en tabla aparte, purgable) sí se fija ya
(Constitution XI, no excepcionable). **Alternativa descartada**: redactar PII del contenido antes de persistir —
frágil, contradice XI; cifrado app-level en esta feature — fuera del MVP magro (XV).

## D5 · Reutilización sobre 001/002/004 (Constitution III, XV)

**Decisión**: reutilizar sin tocar 001/002 —
- **Auth/RBAC**: `authenticate` + `requireRole('technician')` (001); actor sólo del token (FR-007).
- **FSM**: `transition-table.ts` ya declara legales `['assigned','in_progress']` e `['in_progress','pending_review']`
  (verificado). `applyTransition` intacto.
- **Auditoría**: `OrderAudit` (002b/004) reutilizada; `event_type=transition`; sin cambio de esquema.
- **Errores/observabilidad**: contrato `{code,message,details?,agent_action}`, `error-mapper`, correlation-ID (001).
- **Migración aditiva**: nuevas tablas `order_evidence` (+trigger append-only) y `order_execution_notes`; sin tocar
  `orders`/`order_audit`.

**Nuevo** (aditivo): entidades `OrderEvidence`/`OrderExecutionNotes`, módulo de dominio `submit-execution`, 2
endpoints, extensión del contrato y del `error-mapper`.

## D6 · `attempt` base-ready (spec A1/H-004, Constitution XI)

**Decisión**: columna `attempt int NULL` en **ambas** `OrderEvidence` y `OrderExecutionNotes`, siempre `NULL` y
sin lógica en el MVP. Invariante para #005: en un mismo registro de ejecución, evidencia y notas comparten el
mismo `attempt` (misma transacción). Evita una migración no-aditiva cuando #005 (rechazo→reintento) active el
versionado por intento. **Alternativa descartada**: no reservar la columna — forzaría migración no-aditiva luego.
