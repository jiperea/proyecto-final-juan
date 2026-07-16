# Feature Specification: Evidencia fotográfica — binario y visualización por URL firmada (024)

**Feature Branch**: `024-evidence-binary-signed-url`

**Created**: 2026-07-16

**Status**: Draft

**Input**: Implementa la deuda histórica «#007-subida» (subida binaria real de evidencia + servir la imagen), independiente del git `007-resumen-incidencia-ia` (resumen IA). Hoy la evidencia solo existe como metadatos (`EvidenceMeta`: `count`+`content_types`); el técnico/supervisor ve tiles «Imagen N» pero **no puede abrir la foto**. Esta feature cierra ese hueco de forma segura.

> **Full-stack, contract-first, sensible en seguridad** (Constitución IV/IX/XI). Toca contrato (OpenAPI),
> backend (hexagonal: dominio puro + adaptador de almacenamiento en infra) y front (abrir la imagen).
> **No** cambia el FSM de la orden, ni el reskin (FE-8/9), ni el resumen IA (018). Reutiliza la validación
> de evidencia ya existente (`EvidenceRef`: allowlist `image/{jpeg,png,webp,heic}`, tamaño 1..25 MiB).

## Clarifications

### Session 2026-07-16 (decisiones por defecto informado — el panel G1 las valida)

- Q: ¿Mecanismo de **subida** (FR-012)? → A: **Multipart directo a nuestra API**. El backend recibe el binario, **valida allowlist/tamaño en el borde** y lo almacena cifrado, atómico con la transición/auditoría (FR-011). Motivo: sin dependencia cloud de pago (dev-local/mock), validación y control server-side de la superficie, coherente con hexagonal. Se descarta pre-signed PUT (el cliente subiría directo a un store externo; complica validación de tipo/tamaño y no hay store cloud en dev).
- Q: ¿Cómo se **sirve la lectura** (FR-013)? → A: Un **endpoint de lectura autoriza (por orden+rol) y responde 302 redirect a una URL firmada efímera** (token firmado + **TTL ≤300 s**) servida por el backend (adaptador local en dev). Motivo: cumple «URL firmada ≤300 s» de forma verificable (expiración testeable), no expone `object_ref`, y el front solo sigue el enlace (`<img>`/nueva pestaña). Equivale funcionalmente a devolver la URL en el cuerpo, pero el 302 simplifica el front.
- Q: ¿**Plazo de retención** del binario PII (FR-009)? → A: **90 días tras el cierre**, decidido y fijo; después se **purga** (410). Metadatos/auditoría permanecen (XI).

### Session 2026-07-16b (endurecimiento de seguridad tras G1 — anclado al modelo existente)

- **Token de acceso ligado al principal (S-001/H-005)**: el token firmado no es un bearer libre; va **ligado al usuario autenticado + orden + evidencia**, es **de un solo uso** y TTL ≤300 s; el front lo consume por **fetch same-origin a un blob** (nunca URL en DOM/Referer/historial; `Referrer-Policy: no-referrer`, `Cache-Control: no-store`).
- **404 uniforme (S-004/T-001)**: sin sesión → 401; cualquier no-autorizado/inexistente/ajeno → **404 uniforme**, **nunca 403** (idéntico a `getOrderDetail`).
- **Autorización = la de `getOrderDetail` (S-002/S-003/T-002/S-007)**: no hay regla nueva; el acceso a evidencia reutiliza exactamente la autorización del detalle (dueño **actual** + supervisor; org plana, sin partición por equipo). La reasignación transfiere el acceso al nuevo dueño; el saliente lo pierde. Órdenes `closed` en retención: igual regla, sin acceso especial.
- **evidenceId∈orderId (S-005)**: se verifica pertenencia; mismatch → 404.
- **Atomicidad realista (H-001)**: blob primero; la transacción de Postgres (metadatos+transición+auditoría) es la verdad; huérfano → GC.
- **Contenido real (H-009)**: se valida magic-bytes, no solo el tipo declarado.
- **Purga programada (H-004/H-018)**: job, no perezoso.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El técnico sube fotos reales de evidencia (Priority: P1)

Como técnico, al registrar la ejecución adjunto **≥1 foto real** (no solo un metadato); el sistema la almacena de forma segura y la asocia al ciclo de ejecución de mi orden.

**Why this priority**: sin binario almacenado no hay nada que abrir; es la base de la feature.

**Independent Test**: como técnico dueño de una orden `in_progress`, subir 1..N imágenes válidas y enviar a revisión; el detalle refleja `count` = N y las imágenes quedan recuperables (US2).

**Acceptance Scenarios**:

1. **Given** el técnico dueño en `in_progress`, **When** envía la ejecución con ≥1 imagen válida (allowlist/tamaño), **Then** se almacenan cifradas en reposo y la orden pasa a `pending_review` con `count` = nº de imágenes.
2. **Given** una imagen fuera de allowlist o de tamaño, **When** se intenta subir, **Then** se rechaza con error de validación (4xx `{code,message,details,agent_action}`) sin almacenar nada.
3. **Given** un rol distinto del técnico dueño, **When** intenta subir evidencia a esa orden, **Then** se rechaza (401 sin sesión / **404 uniforme** por no-enumeración; nunca 403).

---

### User Story 2 - Ver/abrir la imagen de evidencia desde el detalle (Priority: P1)

Como técnico dueño o supervisor con permiso, en el detalle de la orden puedo **abrir cada foto** de evidencia; la imagen se sirve mediante una **URL firmada efímera** (no un enlace público permanente).

**Why this priority**: es la petición directa del usuario (hoy no se puede abrir la imagen).

**Independent Test**: como supervisor sobre una orden `pending_review` con evidencia, abrir la foto N; se muestra la imagen; la URL firmada deja de funcionar pasado el TTL.

**Acceptance Scenarios**:

1. **Given** el técnico dueño o el supervisor autorizado, **When** solicita ver la evidencia N de su orden, **Then** obtiene acceso a la imagen mediante una URL firmada con **TTL ≤ 300 s**.
2. **Given** un dispatcher (mínimo privilegio) u otro rol no autorizado, **When** solicita la evidencia, **Then** se rechaza con **404 uniforme** (nunca 403), sin exponer si existe.
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
- **FR-002**: WHEN la imagen está fuera de la allowlist de tipo (`image/{jpeg,png,webp,heic}`) THE sistema SHALL responder **415**; WHEN excede el tamaño (>25 MiB) o es 0 bytes **413**; otras validaciones de forma **422** — siempre `{code,message,details,agent_action}` y **sin almacenar** (reutiliza la validación de `EvidenceRef`).
- **FR-019**: WHEN se sube un binario THE sistema SHALL validar el **contenido real** (p. ej. *magic bytes* / decodificación de imagen), no solo el `content_type` declarado; un binario con tipo falseado (ej. ejecutable como `image/png`) o corrupto/ilegible se **rechaza** (415/422) sin almacenar.
- **FR-003**: WHEN un actor solicita ver una evidencia de una orden THE sistema SHALL **autorizar server-side reutilizando exactamente la misma regla que `getOrderDetail`** (técnico **dueño actual** o supervisor); el **dispatcher NO** accede (mínimo privilegio, igual que hoy se le omite `evidence`). No hay regla de acceso nueva ni divergente de la del detalle.
- **FR-004**: WHEN la autorización es válida THE sistema SHALL conceder acceso mediante un **token firmado efímero (TTL ≤ 300 s)** ligado al **principal autenticado + `orderId` + `evidenceId`**, **de un solo uso**; no es un enlace público ni permanente ni un bearer reutilizable por terceros.
- **FR-005**: WHEN el token firmado está **caducado, manipulado, ya usado, o presentado por un principal distinto** del que lo obtuvo THE sistema SHALL denegar el acceso.
- **FR-006**: THE evidencia SHALL **no** ser accesible por URL directa sin token válido ligado al principal (test explícito de acceso directo denegado).
- **FR-007**: WHEN falta sesión THE sistema SHALL responder **401**; WHEN el actor autenticado no está autorizado, la orden no existe, es ajena, o el `evidenceId` no existe THE sistema SHALL responder **404 uniforme** (no-enumeración) — **nunca 403**, coherente con `getOrderDetail`. La respuesta es **constante** para todos esos casos (indistinguible existencia vs autorización).
- **FR-008**: THE sistema SHALL **no** emitir en logs/errores el token/URL firmada, el `object_ref` ni el binario (redacción de PII en logs).
- **FR-009**: THE binario de evidencia SHALL retenerse mientras la orden no esté `closed` y **hasta 90 días tras el cierre**; superado ese plazo se **purga** y el acceso responde **410** sin filtrar, conservando **metadatos y auditoría** (inmutables, XI).
- **FR-010**: THE front (detalle de orden) SHALL permitir **abrir cada foto** de evidencia (sustituye el placeholder «Imagen N» de FE-9 por una miniatura/enlace real), con estados de **carga/error**.
- **FR-011**: THE persistencia SHALL ser consistente pese a no haber transacción distribuida entre almacenamiento y BD: el binario se escribe **primero** (staging); la **transacción de Postgres (metadatos de evidencia + transición + auditoría) es la fuente de verdad atómica** — una evidencia solo «cuenta» si su fila de metadatos commitea. Si el commit falla, el binario queda **huérfano y lo purga un GC** (reconciliación); nunca hay metadato sin binario ni `count` inconsistente para el lector.
- **FR-012**: WHEN el técnico dueño sube evidencia THE cliente SHALL enviarla como **multipart directo a la API**; el backend valida allowlist/tamaño en el borde y almacena el binario cifrado (sin pre-signed PUT ni store cloud en dev). *(Resuelto en clarify.)*
- **FR-013**: WHEN el front necesita mostrar/abrir una imagen THE cliente SHALL obtenerla por **fetch autenticado same-origin** (con la sesión) que devuelve el binario, y renderizarla desde un **blob en memoria** (`blob:`), **sin** poner el token/URL firmada en el DOM (`<img src>` directo), el historial ni la cabecera `Referer`. El endpoint responde con `Referrer-Policy: no-referrer` y `Cache-Control: no-store`.
- **FR-014**: THE detalle de la orden (para roles autorizados) SHALL exponer, además de `count`/`content_types`, la **lista de identificadores opacos de evidencia** (`evidenceId` + `content_type` por ítem) para que el front construya el acceso a cada imagen; el `object_ref` interno **no** se expone.
- **FR-015**: WHEN se solicita `{evidenceId}` bajo `{orderId}` THE sistema SHALL **verificar que la evidencia pertenece a esa orden**; si no, **404 uniforme** (evita usar un `orderId` propio para leer evidencia de otra orden).
- **FR-016**: WHEN una orden se **reasigna** (cambia `assigned_to`) THE acceso a la evidencia SHALL seguir la autorización vigente de `getOrderDetail`: el **nuevo** técnico dueño accede; el **saliente pierde** el acceso; el supervisor mantiene el suyo. (No se define partición por equipo/tenant: organización única/plana.)
- **FR-017**: THE evidencia visible SHALL ser la del **ciclo de ejecución vigente**; WHEN una orden rechazada se reenvía (`in_progress → pending_review`), el nuevo envío **reemplaza** el conjunto de evidencia del ciclo anterior (el `count` refleja el ciclo vigente), coherente con «ciclo vigente» del contrato.
- **FR-018**: THE purga de binarios (FR-009) SHALL ejecutarse por un **proceso programado** (no perezoso) que recorre órdenes `closed` con antigüedad > 90 días y purga su binario; un binario nunca accedido igualmente se purga.

### Key Entities

- **OrderEvidence**: evidencia del ciclo de ejecución. Atributos: `id`, referencia opaca al objeto almacenado (`object_ref`, **nunca** expuesta al cliente ni en logs), `content_type` (allowlist), `size_bytes`, `at` (orden temporal), asociación a la orden/ciclo. El **binario** vive en el almacenamiento (infra), cifrado en reposo; el dominio maneja metadatos + puerto de almacenamiento.

## Contrato (OpenAPI) *(obligatorio — Constitution II)*

- **Fichero**: `contracts/orders.openapi.yaml` (OpenAPI 3.1), evolución **compatible** (no rompe `EvidenceMeta`; `count`/`content_types` se conservan; se **añade** la lista de ítems con `evidenceId`+`content_type`).
- **Endpoints** (decisiones de clarify ya cerradas):
  - **Subida**: `submitOrderExecution` evoluciona a **multipart** (imagen(es) + notas); valida allowlist/tamaño; sin `createEvidenceUploadUrl`.
  - **Lectura**: `getOrderEvidence` — `GET /v1/orders/{orderId}/evidence/{evidenceId}` — roles `technician (dueño actual)`, `supervisor` — respuestas `200` (binario, mismo origen, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`) · `401` · **`404` uniforme** (no 403) · `410` (purgada). Acceso ligado al principal+orden+evidencia, single-use, TTL≤300 s.
  - **Detalle**: `getOrderDetail` amplía `EvidenceMeta` con `items: [{evidenceId, content_type}]` (compatible; solo roles autorizados).
- **Errores** `{code,message,details,agent_action}` con HTTP correcto (400/401/404/410/413/415/422/503); `413`/`415` para tamaño/tipo. **No se usa 403** (404 uniforme).

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint(s) | Test(s) |
|----|-------------|---------|
| FR-001 | `submitOrderExecution` | `integration/evidence-upload-store` (count=N, cifrado) |
| FR-002 | `submitOrderExecution` | `contract/evidence-validation` (415 tipo, 413 tamaño) |
| FR-003 | `getOrderEvidence` | `integration/evidence-authz` (dueño/supervisor sí, dispatcher no) |
| FR-004 | `getOrderEvidence` | `integration/evidence-token-ttl` (≤300s, single-use, ligado a principal) |
| FR-005 | `getOrderEvidence` | `integration/evidence-token-invalid` (caducado/manipulado/reusado/otro principal) |
| FR-006 | (almacenamiento) | `integration/evidence-no-direct-access` |
| FR-007 | `getOrderEvidence` | `integration/evidence-404-uniforme` (401 sin sesión; 404 no autorizado/ajena/inexistente) |
| FR-008 | (logging) | `integration/evidence-nolog` (grep sin token/object_ref/binario) |
| FR-009 | (retención) | `integration/evidence-retention-410` |
| FR-010 | front detalle | `unit/evidence-open-image` (abrir, carga/error) |
| FR-011 | `submitOrderExecution` | `integration/evidence-atomic-gc` (commit BD = verdad; huérfano purgado) |
| FR-012 | `submitOrderExecution` | `contract/submit-multipart` |
| FR-013 | front detalle | `unit/evidence-blob-no-leak` (blob:, sin URL en DOM/Referer) |
| FR-014 | `getOrderDetail` | `contract/detail-evidence-items` (evidenceId+content_type) |
| FR-015 | `getOrderEvidence` | `integration/evidence-belongs-to-order` (mismatch → 404) |
| FR-016 | `getOrderEvidence` | `integration/evidence-reassign-access` (nuevo sí, saliente no) |
| FR-017 | `submitOrderExecution` | `integration/evidence-cycle-replace` (reenvío reemplaza) |
| FR-018 | (job de purga) | `integration/evidence-purge-job` |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El técnico dueño puede **subir ≥1 imagen** válida y, tras enviar a revisión, `count` refleja el nº real de imágenes almacenadas (verificable end-to-end).
- **SC-002**: El técnico dueño y el supervisor autorizado pueden **abrir cada imagen**; el dispatcher y roles no autorizados **no** (**404 uniforme**). 100% de los pares (rol × autorización) cubiertos por test.
- **SC-003**: **100%** de las URLs de acceso son firmadas con **TTL ≤ 300 s**; una URL caducada no sirve la imagen (test de expiración).
- **SC-004**: La evidencia **no** es accesible por URL directa sin autorización (test negativo) y está **cifrada en reposo** (test/estándar).
- **SC-005**: **0** apariciones de URL firmada / `object_ref` / binario en logs (grep de logs en test).
- **SC-006**: La **retención** del binario PII se aplica: tras el plazo definido, el binario se purga y el acceso devuelve «no disponible» sin filtrar (test de purga/expiración).
- **SC-007**: **100%** de contract tests (operationId × código) y **0 regresiones** en la suite (backend + front); cobertura dominio ≥80%, transiciones/contratos 100%.

## Assumptions

- **Almacenamiento**: adaptador en infra (el dominio no conoce el proveedor). En dev/test, almacenamiento **local/mock** (sin dependencia cloud de pago; compatible con Render/Neon en prod más adelante). Cifrado en reposo AES-256.
- **Retención**: plazo **decidido y fijo = 90 días tras el cierre** (FR-009); no queda pendiente. Un cambio de plazo sería una enmienda de spec, no una variable abierta. La auditoría (metadatos/hash) es inmutable e independiente (XI).
- **Gestión de claves (AES-256)**: la clave de cifrado en reposo vive en **configuración/secreto validado al arrancar** (fail-fast, como `JWT_SECRET`/`CSRF_HMAC_SECRET`), **nunca hardcodeada**; en dev/test una clave real de entorno (no simbólica) para que SC-004 verifique cifrado efectivo. Rotación de claves fuera de alcance (deuda futura).
- **Acceso a órdenes `closed` durante la retención (≤90 d)**: el acceso a su evidencia **hereda la autorización de `getOrderDetail` en el momento de la petición** (FR-003) — no hay acceso especial por la ventana de retención; quien ya no esté autorizado por el detalle no accede.
- **Reutilización**: la validación de allowlist/tamaño ya existe en `EvidenceRef`; no se redefine.
- **Invariantes**: no cambia el FSM ni el reskin (FE-8/9) ni el resumen IA (018); el front solo añade abrir la imagen sobre los tiles de FE-9.
- **STRIDE**: el plan incluirá **threat modeling STRIDE** (spoofing de acceso, tampering de URL, repudio→auditoría, information disclosure→cifrado/redacción, DoS→tamaño/rate, elevation→RBAC por-orden).

## Eval de objetivos (promptfoo) *(N/A — sin IA)*

- Sin componente IA (el resumen IA es 018). Los SC se verifican con tests **deterministas** (integración con Postgres real + adaptador de almacenamiento, contract tests, grep de logs, expiración de URL, purga por retención), no con promptfoo.
