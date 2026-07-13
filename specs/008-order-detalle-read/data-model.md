# Data Model — Detalle de orden (read-side) · #010

**#010 no crea ni modifica esquema.** No hay entidad nueva, migración ni columna. Solo se **leen** entidades
existentes (002a/003/005/006). Esta sección documenta **qué se lee** y **cómo se ensambla** el DTO.

## Entidades leídas (existentes, sin cambios)

| Entidad | Feature | Uso en #010 | PII / notas |
| ------- | ------- | ----------- | ----------- |
| `orders` | 002a/002b | estado + campos + guard de visibilidad (`assigned_to`, `status`, `version`, timestamps) | `assigned_to` = uuid opaco (no PII) |
| `order_audit` (append-only) | 003/006 | **última reject** (`fromStatus=pending_review`,`toStatus=in_progress`) → `reason` (excepción XI); **último submit** (`reason='execution_registered'`) → `audit_id` del ciclo vigente + su `at` | `reason` = texto libre; se **sanea al leer**; nunca en logs (`REDACT_PATHS`) |
| `order_evidence` (append-only) | 005 | metadatos del ciclo vigente: `content_type` (por `audit_id`), conteo | `object_ref` **nunca** se sirve |
| `order_execution_notes` | 005 | `notes` del ciclo vigente (por `audit_id`) | payload PII (IX); servido a technician dueño/supervisor, **sin** redactor |

**Enlace del ciclo**: `order_evidence.audit_id` y `order_execution_notes.audit_id` → `order_audit.id` del submit
(FK RESTRICT, ya existentes). El "ciclo vigente" = `audit_id` del **último** submit.

## DTO de salida (efímero) — `OrderDetailResponse`

Forma (contrato `contracts/orders.openapi.yaml` v1.5.0):

```
OrderDetailResponse = {
  order: Order,                       // siempre presente (id,title,description,status,assigned_to,version,created_at,updated_at)
  notes?: string,                     // ciclo vigente; solo technician dueño/supervisor; omitido para dispatcher / sin ciclo
  evidence?: EvidenceMeta,            // solo technician dueño/supervisor; omitido para dispatcher; {count:0,content_types:[]} si no hay ciclo
  last_rejection_reason?: string      // solo technician dueño ACTUAL con rechazo SIN atender; saneado; omitido si falla el redactor
}
EvidenceMeta = { count: int≥0, content_types: (image/jpeg|png|webp|heic)[] }  // ordenado por at asc; count == length
```

**Convención de ausencia**: se **omite la clave** (nunca `null`).

## Reglas de ensamblado por rol (dominio puro)

| Rol | `order` | `notes` | `evidence` | `last_rejection_reason` |
| --- | ------- | ------- | ---------- | ----------------------- |
| technician **dueño** (`assigned_to==actor`) | ✓ | ✓ (ciclo vigente) | ✓ | ✓ **si** rechazo sin atender (saneado, fail-closed) |
| supervisor (orden en `pending_review`) | ✓ | ✓ (ciclo vigente) | ✓ | ✗ (omitido) |
| dispatcher (orden en `assigned`/`in_progress`) | ✓ | ✗ | ✗ | ✗ |
| cualquier rol, orden **fuera de alcance** | — | — | — | — → **404** (no DTO) |

**Visibilidad → 404**: si la orden no existe / no es del alcance del rol / `draft` / `closed` / `orderId`
malformado / rol no reconocido → `404` genérico (no se ensambla DTO). Precedencia: `401` antes que visibilidad.

## Invariantes verificables

- `count == content_types.length`; `content_types` ordenada por `at` asc (desempate `id`).
- `evidence.count == 0` **solo** cuando no hay ciclo (sin submit); un ciclo enviado ⇒ `count ≥ 1` (005 FR-004).
- `last_rejection_reason` presente ⇔ (rol = technician dueño actual) ∧ (última reject `at` > último submit `at`) ∧
  (redactor OK). En cualquier otro caso: clave **omitida**.
- Guard de propiedad + lectura de reject/submit en el **mismo snapshot** (sin estados híbridos ni fuga a ex-dueño).
- Respuesta sin `object_ref` ni PII estructural en el motivo; `reason` crudo nunca en logs.

## Observabilidad de accesos denegados (FR-009) — sin entidad ni migración

#010 **no** crea tabla nueva. En `401`/`404` **emite una entrada de log best-effort** `{actor?, endpoint, recurso,
outcome∈{401_unauth,404_not_visible}}` con `recurso` saneado (UUID o `<malformed>`) por el **logger `pino`
compartido** vía un **puerto propio** `DeniedAccessLoggerPort` (NO el `AccessLogPort` de 007, tipado para ai-summary
y sin caso 401; 007 inamovible); a diferencia de ai-summary, **sí emite en 401**. **No** se persiste en
`order_audit` (su `order_id` es FK **NOT NULL** a `orders`, incompatible con un 401/orden inexistente). El
**registro forense durable append-only** (transversal a todos los endpoints, XI) es la feature **#009**
(`auditoria-accesos-denegados`, BL-002/067), fuera del MVP; #010 no lo construye ni lo duplica.
