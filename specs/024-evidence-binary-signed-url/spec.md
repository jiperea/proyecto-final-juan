# Feature Specification: Evidencia fotográfica — binario y visualización por URL firmada (024)

**Feature Branch**: `024-evidence-binary-signed-url`

**Created**: 2026-07-16

**Status**: Draft

**Input**: Implementa la deuda histórica «#007-subida» (subida binaria real de evidencia + servir la imagen), independiente del git `007-resumen-incidencia-ia` (resumen IA). Hoy la evidencia solo existe como metadatos (`EvidenceMeta`: `count`+`content_types`); el técnico/supervisor ve tiles «Imagen N» pero **no puede abrir la foto**. Esta feature cierra ese hueco de forma segura.

> **Full-stack, contract-first, sensible en seguridad** (Constitución IV/IX/XI). Toca contrato (OpenAPI),
> backend (hexagonal: dominio puro + adaptador de almacenamiento en infra) y front (abrir la imagen).
> **No** cambia el FSM de la orden, ni el reskin (FE-8/9), ni el resumen IA (018). Reutiliza la validación
> de evidencia ya existente (`EvidenceRef`: allowlist `image/{jpeg,png,webp,heic}`, tamaño 1..25 MiB).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El técnico sube fotos reales de evidencia (Priority: P1)

Como técnico, al registrar la ejecución adjunto **≥1 foto real** (no solo un metadato); el sistema la almacena de forma segura y la asocia al ciclo de ejecución de mi orden.

**Why this priority**: sin binario almacenado no hay nada que abrir; es la base de la feature.

**Independent Test**: como técnico dueño de una orden `in_progress`, subir 1..N imágenes válidas y enviar a revisión; el detalle refleja `count` = N y las imágenes quedan recuperables (US2).

**Acceptance Scenarios**:

1. **Given** el técnico dueño en `in_progress`, **When** envía la ejecución con ≥1 imagen válida (allowlist/tamaño), **Then** se almacenan cifradas en reposo y la orden pasa a `pending_review` con `count` = nº de imágenes.
2. **Given** una imagen fuera de allowlist o de tamaño, **When** se intenta subir, **Then** se rechaza con error de validación (4xx `{code,message,details,agent_action}`) sin almacenar nada.
3. **Given** un rol distinto del técnico dueño, **When** intenta subir evidencia a esa orden, **Then** se rechaza (401 sin sesión / 403 o 404 uniforme por no-enumeración).

---

### User Story 2 - Ver/abrir la imagen de evidencia desde el detalle (Priority: P1)

Como técnico dueño o supervisor con permiso, en el detalle de la orden puedo **abrir cada foto** de evidencia; la imagen se sirve mediante una **URL firmada efímera** (no un enlace público permanente).

**Why this priority**: es la petición directa del usuario (hoy no se puede abrir la imagen).

**Independent Test**: como supervisor sobre una orden `pending_review` con evidencia, abrir la foto N; se muestra la imagen; la URL firmada deja de funcionar pasado el TTL.

**Acceptance Scenarios**:

1. **Given** el técnico dueño o el supervisor autorizado, **When** solicita ver la evidencia N de su orden, **Then** obtiene acceso a la imagen mediante una URL firmada con **TTL ≤ 300 s**.
2. **Given** un dispatcher (mínimo privilegio) u otro rol no autorizado, **When** solicita la evidencia, **Then** se rechaza (403/404 uniforme), sin exponer si existe.
3. **Given** una URL firmada **caducada** (> TTL), **When** se usa, **Then** el acceso falla (no sirve la imagen).
4. **Given** una imagen almacenada, **When** se intenta acceder por URL directa **sin firma/autorización**, **Then** el acceso se deniega.

---

### User Story 3 - Seguridad y privacidad de la evidencia (Priority: P1)

Como responsable de datos, la evidencia (PII) se protege: cifrada en reposo, autorizada por-orden antes de emitir cualquier URL, la URL y la referencia del objeto **nunca** aparecen en logs, y se respeta una política de retención.

**Why this priority**: la evidencia es PII de cliente; una fuga o acceso indebido es el mayor riesgo (Constitución IX).

**Independent Test**: revisar que (a) el acceso requiere autorización por-orden; (b) la URL expira ≤300 s; (c) los logs no contienen la URL/`object_ref`/binario; (d) el cifrado en reposo está activo.

**Acceptance Scenarios**:

1. **Given** cualquier acceso a evidencia, **When** se procesa, **Then** la autorización se resuelve **server-side por orden + pertenencia + rol** antes de emitir la URL (no confía en el cliente).
2. **Given** el registro de logs, **When** se sube o se sirve evidencia, **Then** ni la URL firmada, ni el `object_ref`, ni el binario aparecen en logs/errores.
3. **Given** el almacenamiento, **When** se guarda una imagen, **Then** queda **cifrada en reposo** y sujeta a la política de retención del payload PII (distinta de la auditoría, XI).

---

### Edge Cases

- **Sin evidencia (`count` 0)**: no hay nada que abrir; el detalle muestra «sin evidencia» (comportamiento de FE-9).
- **Evidencia de orden `closed`/histórica**: acceso según rol/pertenencia; la retención puede haber purgado el binario → estado «no disponible» sin filtrar detalles.
- **URL firmada reutilizada tras caducar / manipulada**: acceso denegado.
- **Fallo del almacenamiento** (subir/servir): error `{code,...}` con `agent_action`, sin dejar estado inconsistente (subida atómica con la transición/auditoría, XI).
- **IDOR**: pedir la evidencia `M` de una orden ajena vía id → 404 uniforme (no-enumeración), nunca servir el binario.
- **Minimización IA**: si la evidencia alimenta el resumen IA (018), el puerto de dominio minimiza/redacta antes del proveedor; esta feature no envía binario a terceros.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: WHEN el técnico dueño de una orden en `in_progress` envía la ejecución con ≥1 imagen THE sistema SHALL **almacenar el binario cifrado en reposo** y asociarlo al ciclo, reflejando `count` y `content_types` (evolución compatible de `EvidenceMeta`).
- **FR-002**: WHEN la imagen está fuera de la allowlist (`image/{jpeg,png,webp,heic}`) o del tamaño (1..25 MiB) THE sistema SHALL rechazarla con 4xx `{code,message,details,agent_action}` sin almacenar (reutiliza la validación de `EvidenceRef`).
- **FR-003**: WHEN un actor solicita ver la evidencia `N` de una orden THE sistema SHALL **autorizar server-side por orden + pertenencia + rol** (técnico dueño o supervisor en ámbito) antes de emitir acceso; el **dispatcher NO** accede (mínimo privilegio).
- **FR-004**: WHEN la autorización es válida THE sistema SHALL servir la imagen mediante una **URL firmada con TTL ≤ 300 s** (no un enlace público ni permanente).
- **FR-005**: WHEN se usa una URL firmada **caducada o manipulada** THE sistema SHALL denegar el acceso.
- **FR-006**: THE evidencia SHALL **no** ser accesible por URL directa sin firma/autorización (test explícito).
- **FR-007**: WHEN un rol no autorizado o una orden ajena solicita evidencia THE sistema SHALL responder **401** (sin sesión) / **403 o 404 uniforme** (no-enumeración), coherente con el resto de `orders`.
- **FR-008**: THE sistema SHALL **no** emitir en logs/errores la URL firmada, el `object_ref` ni el binario (redacción de PII en logs).
- **FR-009**: THE binario de evidencia SHALL estar sujeto a la **política de retención del payload PII** (plazo definido en esta spec/plan), independiente del registro de auditoría (XI); tras el plazo, el binario se purga y el acceso devuelve «no disponible» sin filtrar.
- **FR-010**: THE front (detalle de orden) SHALL permitir **abrir cada foto** de evidencia (sustituye el placeholder «Imagen N» de FE-9 por una miniatura/enlace real que abre la imagen), con estados de **carga/error**, y **sin** exponer la URL firmada en logs/consola del cliente.
- **FR-011**: THE subida binaria SHALL ser **atómica** con la transición de estado y la auditoría (todo-o-nada), sin dejar evidencia huérfana ni estado inconsistente (coherente con la transacción de 005/XI).
- **FR-012**: THE mecanismo de **subida** [NEEDS CLARIFICATION: (a) multipart directo a nuestra API (el backend recibe y almacena el binario, valida tipo/tamaño en el borde) vs (b) URL firmada de **subida** (pre-signed PUT) al almacenamiento y el cliente sube directo. Impacta arquitectura, superficie de ataque y dónde se validan tipo/tamaño].
- **FR-013**: THE forma de **servir la lectura** [NEEDS CLARIFICATION: (a) endpoint que responde **302 redirect** a la URL firmada, (b) endpoint que **devuelve la URL firmada en el cuerpo** y el front la usa, o (c) el detalle ya incluye un enlace firmado por evidencia. Impacta el contrato y el front].

### Key Entities

- **OrderEvidence**: evidencia del ciclo de ejecución. Atributos: `id`, referencia opaca al objeto almacenado (`object_ref`, **nunca** expuesta al cliente ni en logs), `content_type` (allowlist), `size_bytes`, `at` (orden temporal), asociación a la orden/ciclo. El **binario** vive en el almacenamiento (infra), cifrado en reposo; el dominio maneja metadatos + puerto de almacenamiento.

## Contrato (OpenAPI) *(obligatorio — Constitution II)*

- **Fichero**: `contracts/orders.openapi.yaml` (OpenAPI 3.1), evolución **compatible** (no rompe `EvidenceMeta`/consumidores actuales; `count`/`content_types` se conservan).
- **Endpoints** (forma final según FR-012/FR-013, clarify):
  - **Lectura**: p. ej. `getOrderEvidence` — `GET /v1/orders/{orderId}/evidence/{evidenceId}` — roles `technician (dueño)`, `supervisor` — respuestas `200`/`302` · `401` · `403/404` uniforme · `410` (purgada por retención).
  - **Subida real**: evolución de `submitOrderExecution` (multipart) **o** `createEvidenceUploadUrl` (pre-signed) según FR-012.
- **Errores** `{code,message,details,agent_action}` con HTTP correcto (400/401/403/404/410/413/415/422/503); `413`/`415` para tamaño/tipo.

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint(s) | Tarea(s) | Test(s) |
|----|-------------|----------|---------|
| FR-004 | `getOrderEvidence` | (tasks) | `integration/evidence-signed-url-ttl` |
| FR-006 | (almacenamiento) | (tasks) | `integration/evidence-no-direct-access` |
| FR-007 | `getOrderEvidence` | (tasks) | `integration/evidence-rbac` (403 dispatcher, 404 ajena) |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El técnico dueño puede **subir ≥1 imagen** válida y, tras enviar a revisión, `count` refleja el nº real de imágenes almacenadas (verificable end-to-end).
- **SC-002**: El técnico dueño y el supervisor autorizado pueden **abrir cada imagen**; el dispatcher y roles no autorizados **no** (403/404). 100% de los pares (rol × autorización) cubiertos por test.
- **SC-003**: **100%** de las URLs de acceso son firmadas con **TTL ≤ 300 s**; una URL caducada no sirve la imagen (test de expiración).
- **SC-004**: La evidencia **no** es accesible por URL directa sin autorización (test negativo) y está **cifrada en reposo** (test/estándar).
- **SC-005**: **0** apariciones de URL firmada / `object_ref` / binario en logs (grep de logs en test).
- **SC-006**: La **retención** del binario PII se aplica: tras el plazo definido, el binario se purga y el acceso devuelve «no disponible» sin filtrar (test de purga/expiración).
- **SC-007**: **100%** de contract tests (operationId × código) y **0 regresiones** en la suite (backend + front); cobertura dominio ≥80%, transiciones/contratos 100%.

## Assumptions

- **Almacenamiento**: adaptador en infra (el dominio no conoce el proveedor). En dev/test, almacenamiento **local/mock** (sin dependencia cloud de pago; compatible con Render/Neon en prod más adelante). Cifrado en reposo AES-256.
- **Retención**: plazo del payload PII a fijar en clarify/plan (alineado con IX); la auditoría (metadatos/hash) es inmutable e independiente (XI).
- **Reutilización**: la validación de allowlist/tamaño ya existe en `EvidenceRef`; no se redefine.
- **Invariantes**: no cambia el FSM ni el reskin (FE-8/9) ni el resumen IA (018); el front solo añade abrir la imagen sobre los tiles de FE-9.
- **STRIDE**: el plan incluirá **threat modeling STRIDE** (spoofing de acceso, tampering de URL, repudio→auditoría, information disclosure→cifrado/redacción, DoS→tamaño/rate, elevation→RBAC por-orden).

## Eval de objetivos (promptfoo) *(N/A — sin IA)*

- Sin componente IA (el resumen IA es 018). Los SC se verifican con tests **deterministas** (integración con Postgres real + adaptador de almacenamiento, contract tests, grep de logs, expiración de URL, purga por retención), no con promptfoo.
