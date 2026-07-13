# Data Model — 007 Resumen de incidencia por IA

**Sin cambios de esquema**: 0 tablas nuevas, 0 columnas, **0 migraciones**. 007 **lee** entidades de 002a/005 y
**no persiste** el prompt ni el resumen. El evento de acceso es un **log** (no tabla).

## Entidades leídas (existentes)

### Order (`orders`) — sólo lectura (visibilidad)
- Se usa `status` para la visibilidad del supervisor (`pending_review`, alcance de 006). No se muta.

### OrderExecutionNotes (`order_execution_notes`, 005) — sólo lectura (fuente)
- Campo `notes` (texto del técnico) = **fuente principal** del resumen. Se **minimiza** (allowlist + redacción)
  antes de enviarlo al proveedor. No se muta.

### OrderEvidence (`order_evidence`, 005) — sólo lectura (metadatos)
- Se leen **metadatos**: `conteo` de evidencias y `content_type` de cada una. **Nunca** `object_ref` (PII) ni el
  binario. No se muta.

## Artefactos efímeros (no persistidos)

### PromptInput (efímero, en memoria)
- `{ notesRedacted: string, evidence: {count, contentTypes[]} }` — resultado de la **minimización** (D2). No se
  persiste ni se loguea.

### IncidentSummaryResponse (respuesta, efímera)
- `{ summary: string | null, sufficient: boolean }`. `summary` = texto (≤1200) cuando `sufficient=true`; `null`
  cuando `sufficient=false` (fallback). No se persiste con PII.

## Evento de acceso (FR-013) — LOG estructurado, sin PII

- `{ actor: uuid, orderId: uuid, timestamp, outcome ∈ {success, fallback_insufficient, blocked_pii, error,
  denied} }`. Emitido por cada petición con actor autenticado (cualquier resultado de la precedencia). **Sin**
  prompt, resumen ni `object_ref`. Categoría de log dedicada (`access.ai_summary`). Almacenamiento durable = #009.

## Reglas de validación / decisión

| Punto | Regla | Resultado |
|---|---|---|
| Rol | `role == supervisor` | si no → `403 FORBIDDEN_ROLE` (o 401) |
| Rate-limit | ≤ 10 req / 60 s por usuario | exceso → `429` `RATE_LIMITED` + `Retry-After` |
| Visibilidad | orden existe ∧ `status = pending_review` | si no → `404` genérico (no-enumeración) |
| Minimización entrada | allowlist + redacción PII estructurada (`[REDACTED]`) + prompt anti-PII | prompt minimizado |
| Corto-circuito | notas vacías tras saneo **Y** 0 evidencias | fallback `sufficient=false` (sin llamar al proveedor) |
| Timeout proveedor | > 10 000 ms o fallo de proceso | `503` `SERVICE_UNAVAILABLE` |
| Salida | no vacía tras trim ∧ `len ≤ 1200` ∧ sin PII estructurada | si falla alguna → fallback (`blocked_pii` si PII) |
| Suficiencia | el proveedor declara `sufficient` | `sufficient=false` → fallback (no inventa) |

**Precedencia (FR-012)**: `401 → 403 → 429 → 404 → proveedor (503 | 200 resumen/fallback)`.

## Detector de PII (`pii-redactor.ts`, puro)

- **Estructurada (determinista, runtime)**: email, teléfono, matrícula, DNI/NIF (+ `object_ref`/uuids nunca se
  envían por la allowlist). `redactStructured(text) → text con [REDACTED]`; `hasStructuredPii(text) → boolean`.
- **Nombres/direcciones (texto libre)**: **no** hay detección de runtime fiable → prompt-instruction + verificación
  en eval (golden cases de literales conocidos). Documentado como best-effort (**BL-073**).
