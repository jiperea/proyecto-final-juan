# Feature Specification: FE-2 · Front del técnico (iniciar trabajo · registrar ejecución · evidencia)

**Feature Branch**: `014-front-tecnico`

**Created**: 2026-07-14

**Status**: Draft

**Input**: Roadmap FE-2 — "registro la ejecución con ≥1 foto y la envío a revisión". Write-side del técnico
sobre el shell de FE-1 (`009-front-shell-listado`, ya en `develop`). Consume el contrato existente
(`contracts/orders.openapi.yaml`), **sin backend ni contrato nuevos**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Iniciar el trabajo de una orden asignada (Priority: P1)

Como **técnico**, quiero **iniciar** una orden que tengo asignada (estado `assigned`) para pasarla a
`in_progress` y poder registrar su ejecución.

**Why this priority**: es la puerta de entrada del flujo de campo; sin ella no se puede ejecutar nada.

**Independent Test**: con una orden propia `assigned` abierta en el detalle, pulsar **Iniciar** → la orden
pasa a `in_progress` y la UI lo refleja (aparece el formulario de ejecución).

**Acceptance Scenarios**:
1. **Given** una orden propia en `assigned`, **When** el técnico pulsa *Iniciar*, **Then** se llama a
   `startOrderWork`, la orden pasa a `in_progress` (version+1) y la UI muestra el estado nuevo sin recargar.
2. **Given** una orden que **no** es del técnico o inexistente, **When** intenta iniciarla, **Then** recibe
   **404 uniforme** (indistinguible ajena/inexistente) y un mensaje neutro; la UI no revela existencia.
3. **Given** una orden propia que **no** está en `assigned` (p. ej. ya `in_progress`), **When** intenta
   iniciarla, **Then** recibe **409 `INVALID_TRANSITION`** y la UI muestra el error mapeado sin romperse
   (y refresca el estado real de la orden).

### User Story 2 - Registrar la ejecución con evidencia y enviarla a revisión (Priority: P1)

Como **técnico**, quiero **registrar** las notas y **≥1 foto** de una orden `in_progress` y **enviarla a
revisión** (`pending_review`) para cerrar mi parte del trabajo.

**Why this priority**: es el objetivo central de FE-2 (el "registro la ejecución con ≥1 foto y la envío").

**Independent Test**: con una orden propia `in_progress`, rellenar notas válidas, adjuntar ≥1 imagen válida
y **Enviar** → la orden pasa a `pending_review`.

**Acceptance Scenarios**:
1. **Given** notas válidas (1..2000 code points, ≥1 carácter imprimible) y **1..10** imágenes válidas
   (`image/jpeg|png|webp|heic`, 1..25 MiB c/u), **When** el técnico envía, **Then** se llama a
   `submitOrderExecution` con `notes` + lista de `EvidenceRef` (metadato), la orden pasa a `pending_review`
   y la UI lo confirma.
2. **Given** **0** evidencias, **When** intenta enviar, **Then** el envío se **impide** (validación de cliente
   por "≥1 foto") y, si llegara al backend, se mapea **`EVIDENCE_REQUIRED`**; el técnico ve un error claro.
3. **Given** una imagen con `content_type` fuera de la allowlist o `size_bytes` fuera de 1..25 MiB, **When**
   la añade/envía, **Then** se rechaza con mensaje mapeado de **`INVALID_EVIDENCE`** (idealmente antes de
   enviar).
4. **Given** notas vacías o solo whitespace, **When** intenta enviar, **Then** validación (**`VALIDATION_ERROR`**),
   sin llamada o con error mapeado.
5. **Given** dos imágenes que producirían el **mismo `object_ref`**, **When** las añade, **Then** la segunda
   se rechaza (sin duplicados de `object_ref`).
6. **Given** la orden ya no está en `in_progress` (p. ej. cambió server-side), **When** envía, **Then**
   **409 `INVALID_TRANSITION`** mapeado, sin perder lo que el técnico había escrito.

### Edge Cases
- **Transporte binario inexistente (restricción dura del contrato):** el binario de la evidencia **NO viaja**
  por la API (`EvidenceRef` es solo metadato: `object_ref`, `content_type`, `size_bytes`) y **no hay endpoint
  de subida** (signed URL/multipart). FE-2 trabaja a nivel de **metadato**: el técnico captura/selecciona la
  imagen, la app **deriva `content_type` y `size_bytes` reales** del fichero y **genera un `object_ref`
  cliente** (clave opaca), muestra un **preview local** (en memoria) y envía la lista de `EvidenceRef`. El
  binario **no se almacena en ningún sitio** (no hay dónde) → **limitación conocida/deuda** (transporte real
  = #007), documentada; NO se simula una subida que no existe.
- Sesión expira a mitad del formulario → **401 → refresh** (patrón FE-1); si el refresh falla, se preserva lo
  escrito y se pide re-login sin perder datos.
- Imagen ilegible/corrupta o sin `type` → se rechaza con mensaje claro antes de añadirla.
- Reintento de envío tras un error de red → sin duplicar la transición (idempotencia de UX: el botón se
  bloquea durante el envío).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (iniciar trabajo)**: WHEN el técnico abre una orden propia en `assigned` THE front SHALL ofrecer
  la acción **Iniciar** que invoca `startOrderWork` y refleja el nuevo estado `in_progress` (version+1) sin
  recarga completa.
- **FR-002 (formulario de ejecución)**: WHEN la orden propia está en `in_progress` THE front SHALL mostrar un
  formulario con **notas** (obligatorias) y **evidencia** (≥1 imagen), y la acción **Enviar a revisión**
  (`submitOrderExecution`, `in_progress→pending_review`).
- **FR-003 (validación de notas)**: THE front SHALL exigir notas de **1..2000 code points** con **≥1 carácter
  imprimible** antes de habilitar el envío; refleja `VALIDATION_ERROR` si el backend lo rechaza.
- **FR-004 (evidencia · captura y metadato)**: THE front SHALL permitir añadir **1..10** imágenes vía input de
  cámara/archivo (móvil), derivando de cada fichero su **`content_type`** (allowlist `image/jpeg|png|webp|heic`)
  y **`size_bytes`** (1..25 MiB), generando un **`object_ref`** cliente opaco (sin duplicados), y mostrando
  **preview local**. THE front SHALL **rechazar en cliente** las que violen la allowlist/tamaño (mapea
  `INVALID_EVIDENCE`) y exigir **≥1** (mapea `EVIDENCE_REQUIRED`).
- **FR-005 (envío y transición)**: WHEN el técnico envía THE front SHALL llamar a `submitOrderExecution` con
  `{notes, evidence[]}` (metadato), bloquear el botón durante la llamada, y al éxito reflejar `pending_review`.
- **FR-006 (mapeo de errores del contrato)**: THE front SHALL mapear a mensajes de UI del design system:
  `EVIDENCE_REQUIRED`, `INVALID_EVIDENCE`, `VALIDATION_ERROR`, **409 `INVALID_TRANSITION`**, **404 uniforme**
  (ajena/inexistente, sin revelar existencia), 401→refresh, 403 sin-permiso; **fallback** genérico + estado
  offline (reutiliza el mapeo de FR-1).
- **FR-007 (pertenencia y rol)**: THE front SHALL ofrecer estas acciones **solo** al técnico dueño
  (`assigned_to == actor`) sobre sus órdenes activas; el backend es la autoridad (el front no decide acceso),
  y el front no revela órdenes ajenas (404 uniforme).
- **FR-008 (tipos derivados del contrato)**: THE front SHALL derivar los tipos de UI de `contracts/` (codegen),
  **sin redefinirlos**, con aserción **Zod↔contrato** (patrón FE-1); `ExecutionRequest`/`EvidenceRef` según OpenAPI.
- **FR-009 (preservación de datos)**: WHILE se resuelve un error recuperable (401/refresh, red, 409) THE front
  SHALL **no perder** las notas ni las evidencias ya añadidas por el técnico.

### Key Entities
- **Orden (vista técnico)**: `id`, `status` (`assigned`/`in_progress`/`pending_review`), `version`, campos del
  detalle read-side (008). Acciones dependientes del estado.
- **EvidenceRef (metadato de cliente)**: `object_ref` (opaco, generado en cliente, sin duplicados),
  `content_type` (allowlist), `size_bytes` (1..25 MiB). El binario no se transmite.
- **ExecutionRequest**: `notes` (1..2000) + `evidence[]` (1..10 EvidenceRef).

## Success Criteria *(mandatory)*

- **SC-001**: un técnico puede, desde una orden propia `assigned`, **iniciarla** y ver `in_progress` en la
  misma pantalla (sin recarga), en < 2 s tras la respuesta del backend.
- **SC-002**: un técnico puede **registrar y enviar** una ejecución con notas + ≥1 foto y ver la orden en
  `pending_review`; el flujo completo (iniciar→enviar) es completable en móvil sin instrucciones.
- **SC-003**: **el 100% de los errores del contrato** para estas acciones (`EVIDENCE_REQUIRED`,
  `INVALID_EVIDENCE`, `VALIDATION_ERROR`, 409 `INVALID_TRANSITION`, 404, 401, 403) tienen **mensaje de UI
  mapeado** (no un error crudo ni pantalla rota).
- **SC-004 (a11y)**: las pantallas nuevas pasan **axe sin violaciones** y son operables por teclado/lector;
  contraste conforme a los tokens (WCAG 2.1 AA).
- **SC-005 (contrato)**: los tipos de UI provienen del codegen del contrato; la aserción **Zod↔contrato** pasa
  (falla el typecheck si divergen). Sin redefinir tipos a mano.
- **SC-006 (no fuga)**: las **notas** (PII) y el `object_ref` no aparecen en logs ni en cuerpos de error del
  cliente; los mensajes de error no revelan existencia de órdenes ajenas (404 uniforme).

## Verificación
Front sin IA propia (el resumen IA es FE-4). Se verifica con **Vitest + axe** (unit/componente) y, si se
justifica, un **e2e** del flujo iniciar→ejecutar→enviar con el backend mockeado por contrato. Sin evals promptfoo.

## Assumptions
- **FE-1 (009) está en `develop`** y aporta el shell, la capa api (client 401→refresh dedup, CSRF, token en
  memoria), el router/ProtectedRoute, el design system y el master-detail. FE-2 **reutiliza** todo eso.
- **Transporte binario de evidencia = deuda (#007), fuera de alcance.** El contrato solo acepta metadato y no
  hay endpoint de subida → FE-2 envía `EvidenceRef` con un `object_ref` generado en cliente; el binario no se
  persiste. Es una **limitación consciente y documentada**, no un defecto; el "≥1 foto" se cumple a nivel de
  captura + metadato. (Se marcará como deuda trazada para cuando exista el transporte real.)
- **`object_ref` generado en cliente**: esquema opaco estable por fichero (p. ej. derivado de nombre+tamaño+
  marca local), suficiente para la validación de formato y la no-duplicación del contrato. (Detalle exacto =
  plan/clarify.)
- Panel de gate **estándar de front**: los 3 (cínico/spec-theater/rbac) + **`revisor-front-a11y-ux`**.
- Sin cambios de backend ni de `contracts/`. Fuera de alcance: FE-3 (dispatcher), FE-4 (supervisor+IA).
