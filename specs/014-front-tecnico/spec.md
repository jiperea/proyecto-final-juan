# Feature Specification: FE-2 · Front del técnico (iniciar trabajo · registrar ejecución · evidencia)

**Feature Branch**: `014-front-tecnico`

**Created**: 2026-07-14

**Status**: Draft

**Input**: Roadmap FE-2 — "registro la ejecución con ≥1 foto y la envío a revisión". Write-side del técnico
sobre el shell de FE-1 (`009-front-shell-listado`, ya en `develop`). Consume el contrato existente
(`contracts/orders.openapi.yaml`), **sin backend ni contrato nuevos**.

## Clarifications

### Session 2026-07-14
- Q: El contrato solo acepta metadato de evidencia (`EvidenceRef`) y no hay endpoint de subida del binario.
  ¿Cómo maneja FE-2 la foto? → A: **Metadato-only** — el técnico captura ≥1 foto; la app deriva
  `content_type` y `size_bytes` reales del fichero, **genera un `object_ref` cliente**, muestra **preview
  local** y envía la lista de `EvidenceRef`. El binario **NO se transporta** (no hay endpoint) → la UI da un
  **aviso honesto** de que la evidencia se registra como metadato **sin almacenamiento** de la imagen, y se
  documenta como **deuda (#007)**. No se simula una subida inexistente. Cumple el contrato y el "≥1 foto" a
  nivel de captura+metadato, sin backend nuevo.

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
   iniciarla, **Then** recibe **422 `INVALID_TRANSITION`** (el contrato usa 422, no 409) y la UI muestra el
   error mapeado **sin disparar el error boundary** (refresca el estado real de la orden).

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
   el técnico la **añade**, **Then** se rechaza **en el momento de añadir** (no diferido al envío) con mensaje
   mapeado de **`INVALID_EVIDENCE`** (causa concreta: formato o tamaño).
4. **Given** notas vacías o solo whitespace, **When** intenta enviar, **Then** validación de cliente
   (**`VALIDATION_ERROR`**), sin llamada; si llegara al backend, 422 mapeado.
5. **Given** dos imágenes **distintas** añadidas en el mismo lote, **When** se generan sus `object_ref`,
   **Then** son **distintos** (object_ref = UUID aleatorio por ítem, sin colisión falsa); un intento de añadir
   **el mismo fichero** ya presente se detecta por contenido y se avisa (sin duplicar).
6. **Given** la orden ya no está en `in_progress` (cambió server-side), **When** envía, **Then**
   **422 `INVALID_TRANSITION`** mapeado, **sin perder** notas ni evidencias ya añadidas, y refresca el estado.
7. **Given** un usuario cuyo rol **no** es `technician` (dispatcher/supervisor viendo el detalle), **When**
   abre la orden, **Then** el front **no muestra** Iniciar/Enviar (el backend además responde 403
   `FORBIDDEN_ROLE`); defensa en doble capa.

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
- **Dispositivo compartido (campo) — resuelve S-001 (BLOQUEANTE):** si tras un re-login se autentica un actor
  **distinto** (o hay logout), el borrador (notas + evidencias) se **purga** — el borrador se ata a la
  identidad de sesión (`sub`) que lo creó; nunca se hereda entre técnicos (coherente con la purga entre
  cuentas de FE-1).
- **Backgrounding móvil al capturar foto (H-005/H-101):** el input de cámara puede recargar la pestaña en
  Android. Se persisten **solo las notas** (texto, atado a `sub`+`orderId`, p. ej. `sessionStorage`) → el
  técnico no pierde lo escrito. Las **evidencias NO se persisten** (el binario/preview vía object URL no
  sobrevive a un remount): al volver, la lista de evidencias se muestra vacía con un **aviso** de "vuelve a
  añadir las fotos"; **no** se restauran `EvidenceRef` huérfanos sin imagen (evita falsos "tengo N fotos").
  El borrador de notas se limpia al enviar con éxito o al cambiar de identidad (FR-010).
- **HEIC sin `type` (H-007):** varios navegadores devuelven `file.type` vacío para `.heic` de cámara iPhone;
  el front usa **fallback por extensión** para derivar el `content_type` de la allowlist antes de rechazar
  "sin type"; solo se rechaza si ni type ni extensión resuelven a la allowlist.
- **Quitar/reemplazar evidencia (H-006):** el técnico puede **eliminar** una imagen añadida por error (control
  por ítem) sin perder el resto del formulario.
- **Límite de 10 (F-007):** al alcanzar 10 imágenes, el control de añadir se **deshabilita** con mensaje
  asociado ("máximo 10"), no un `INVALID_EVIDENCE` genérico al enviar.
- **Foco tras error (F-008):** tras un error recuperable (422/401/red), el foco se mueve al mensaje de error
  (`aria-live`) o al campo relevante, de forma consistente.
- Reintento de envío tras un error de red → sin duplicar la transición (el botón se bloquea durante el envío,
  con estado accesible `aria-busy`).

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
  cámara/archivo (móvil). Por cada fichero: (a) deriva `content_type` (allowlist `image/jpeg|png|webp|heic`,
  con **fallback por extensión** si `file.type` viene vacío — HEIC) y `size_bytes` (1..25 MiB); (b) genera un
  **`object_ref` = UUID aleatorio** (opaco, 1..512, sin caracteres de control ni whitespace de borde → cumple
  el contrato; **no** deriva del nombre de fichero, para no filtrar PII —S-002— ni colisionar —H-003—); (c)
  muestra **preview del contenido real** (thumbnail vía object URL del fichero), con **nombre accesible** y un
  **control de eliminar por ítem** operable por teclado (F-002); (d) evita re-añadir el **mismo fichero** por
  descuido con una comprobación **best-effort** (nombre+tamaño+`lastModified`) — no bloqueante para el contrato
  (cada `object_ref` es UUID único; el backend nunca verá duplicados), solo una ayuda de UX (H-102). THE front SHALL **rechazar en el momento de añadir** (no al enviar) lo que
  viole allowlist/tamaño (`INVALID_EVIDENCE`, causa concreta) y exigir **≥1** (`EVIDENCE_REQUIRED`). THE front
  SHALL mostrar un **aviso honesto** con el componente informativo del design system (`role="status"`, sin
  estilos sueltos) cuyo texto indique explícitamente que la imagen **se registra como metadato y no se
  almacena** (deuda #007) — sin simular una subida inexistente.
- **FR-005 (envío y transición)**: WHEN el técnico envía THE front SHALL llamar a `submitOrderExecution` con
  `{notes, evidence[]}` (metadato), **bloquear el botón** durante la llamada con estado accesible
  (`aria-busy`/disabled + texto "Enviando…") y al éxito reflejar `pending_review`.
- **FR-006 (mapeo de errores del contrato · códigos reales)**: THE front SHALL mapear a mensajes de UI del
  design system los códigos **reales del contrato**: **422** (`INVALID_TRANSITION`, `EVIDENCE_REQUIRED`,
  `INVALID_EVIDENCE`, `VALIDATION_ERROR` — todos 422 en start/execution, **no 409**), **404 uniforme**
  (ajena/inexistente, sin revelar existencia), **403 `FORBIDDEN_ROLE`** (rol no technician), 401→refresh;
  **fallback** genérico + estado offline (reutiliza el mapeo de FE-1). Precedencia de `submitOrderExecution`
  (payload primero): un payload inválido sobre orden ajena da **422** (no 404) — contemplado en tests.
- **FR-007 (rol · doble capa)**: THE front SHALL ofrecer Iniciar/Enviar **solo** cuando el usuario es de rol
  **`technician`**; para dispatcher/supervisor (que **sí** pueden abrir el detalle vía su propio scope de
  lectura, componente compartido con FE-1/008) el front **oculta** las acciones. El **backend es la
  autoridad** (403 `FORBIDDEN_ROLE`). **Nota (K-004):** el filtro de pertenencia (`assigned_to == actor`) es
  **defensa en profundidad redundante e inalcanzable** por datos: `getOrderDetail` ya acota al technician a
  **sus** órdenes activas → un técnico nunca recibe 200 de una orden ajena (404 uniforme antes de renderizar).
  Por eso la ocultación efectiva del front es **por rol**, no por pertenencia (no se testea un estado
  imposible "technician + orden ajena visible").
- **FR-008 (tipos derivados del contrato)**: THE front SHALL derivar los tipos de UI de `contracts/` (codegen),
  **sin redefinirlos**, con aserción **Zod↔contrato** (patrón FE-1); `ExecutionRequest`/`EvidenceRef` según OpenAPI.
- **FR-009 (preservación de datos + persistencia de borrador)**: WHILE se resuelve un error recuperable
  (401/refresh, red, 422) THE front SHALL **no perder** notas ni evidencias en memoria. Ante un
  **backgrounding/remount** (captura de foto), SHALL persistir **solo las notas** (atado a `sub`+`orderId`) y
  restaurarlas; las **evidencias no se persisten** (el object URL no sobrevive) → al volver se piden de nuevo
  con aviso, sin restaurar refs huérfanos (H-101). Tras un error mueve el **foco** al mensaje/campo (F-008).
- **FR-010 (purga por cambio de identidad · resuelve S-001)**: WHEN cambia el actor de sesión (re-login de un
  `sub` distinto) o hay logout THE front SHALL **purgar** el borrador (notas + evidencias) del actor anterior
  → nunca se hereda entre técnicos en un dispositivo compartido.
- **FR-011 (estados accesibles y de carga)**: THE front SHALL: dar estado accesible a Iniciar/Enviar en vuelo
  (`aria-busy`, disabled real); reutilizar los estados **carga/vacío/error/sin-permiso** de FE-1 para la carga
  del detalle **antes** de decidir Iniciar vs formulario (F-005); y garantizar que las pantallas nuevas pasan
  **axe sin violaciones** y son operables por teclado/lector (SC-004).

### Key Entities
- **Orden (vista técnico)**: `id`, `status` (`assigned`/`in_progress`/`pending_review`), `version`, campos del
  detalle read-side (008). Acciones dependientes del estado.
- **EvidenceRef (metadato de cliente)**: `object_ref` (**UUID aleatorio** opaco por ítem, sin PII ni derivar
  del nombre de fichero; cumple 1..512 sin control/borde), `content_type` (allowlist), `size_bytes`
  (1..25 MiB). El binario no se transmite.
- **ExecutionRequest**: `notes` (1..2000) + `evidence[]` (1..10 EvidenceRef).

## Success Criteria *(mandatory)*

- **SC-001**: un técnico puede, desde una orden propia `assigned`, **iniciarla** y ver `in_progress` en la
  misma pantalla (sin recarga), en < 2 s tras la respuesta del backend.
- **SC-002 (flujo completable, medible)**: en un **e2e del camino feliz** (backend mockeado por contrato) un
  técnico completa iniciar→notas→≥1 foto→enviar y la orden queda en `pending_review`; **criterio objetivo de
  "sin instrucciones"**: las pantallas nuevas **no contienen textos de ayuda/tooltips explicativos** más allá
  de labels/placeholders del design system (verificable por inspección de componentes) y el e2e pasa sin pasos
  de ayuda.
- **SC-003 (errores mapeados)**: **el 100%** del conjunto cerrado de códigos del contrato para estas acciones
  (**422** `INVALID_TRANSITION`/`EVIDENCE_REQUIRED`/`INVALID_EVIDENCE`/`VALIDATION_ERROR`, **404**, **403**
  `FORBIDDEN_ROLE`, **401**) tiene **mensaje de UI mapeado** verificable por test. Definiciones operativas:
  **"error crudo"** = mostrar `error.code`/`error.message` del backend sin transformar; **"pantalla rota"** =
  excepción no capturada que dispara el error boundary. Ninguna de las dos debe ocurrir.
- **SC-004 (a11y)**: las pantallas nuevas pasan **axe sin violaciones**; operables por teclado/lector;
  contraste por tokens (WCAG 2.1 AA). Incluye: estado en vuelo anunciado (`aria-busy`), cada evidencia con
  **nombre accesible** y **eliminar** por teclado, mensajes de error asociados a su campo (`aria-describedby`)
  y foco gestionado tras error. **Objetivos táctiles ≥ 44×44 px CSS** en los controles de campo (Iniciar,
  Enviar, añadir/eliminar foto), incluido en pantallas ≤ 360 px (F-006).
- **SC-005 (contrato)**: los tipos de UI provienen del codegen del contrato; la aserción **Zod↔contrato** pasa
  (falla el typecheck si divergen). El `object_ref` generado en cliente **valida contra el contrato antes de
  añadirse** (no se descubre tarde en el backend). Sin redefinir tipos a mano.
- **SC-006 (no fuga)**: **notas** (PII) y `object_ref` no aparecen en logs, cuerpos de error, **ni en
  telemetría/breadcrumbs** del front (Sentry/analytics/console); los mensajes de error no revelan existencia
  de órdenes ajenas (404 uniforme).

## Verificación
Front sin IA propia (el resumen IA es FE-4). Se verifica con **Vitest + axe** (unit/componente) y, si se
justifica, un **e2e** del flujo iniciar→ejecutar→enviar con el backend mockeado por contrato. Sin evals promptfoo.

## Assumptions
- **FE-1 (009) está en `develop`** y aporta el shell, la capa api (client 401→refresh dedup, CSRF, token en
  memoria), el router/ProtectedRoute, el design system y el master-detail. FE-2 **reutiliza** todo eso.
- **Transporte binario de evidencia = deuda (#007), fuera de alcance — con impacto reconocido.** El contrato
  solo acepta metadato y no hay endpoint de subida → FE-2 envía `EvidenceRef` con `object_ref` UUID; el binario
  no se persiste. **Consecuencia aguas abajo (H-004):** mientras dure la deuda, el supervisor (FE-4) verá de la
  evidencia solo `count`+`content_types` (nunca la imagen; el contrato `EvidenceMeta` tampoco expone
  `object_ref`) → la revisión fotográfica humana **no es posible** hasta #007. Es una **limitación consciente**
  que se **eleva como deuda trazada** (impacto de negocio, no solo técnico), no un defecto de FE-2. El "≥1
  foto" se cumple a nivel de captura + metadato.
- **`object_ref` = UUID aleatorio por ítem** (no derivado de nombre/tamaño): evita colisiones falsas (H-003) y
  fuga de PII del nombre de fichero (S-002); cumple el formato del contrato (1..512, sin control/borde).
- **`version` es informativo server-side, no control de concurrencia de cliente (H-002):** el contrato **no**
  tiene If-Match ni `version` en el cuerpo; la única defensa contra estado obsoleto es la re-validación del FSM
  en el backend (→ 422 al escribir). El front **no** implementa comparación de versiones; refleja el estado y
  reacciona al 422.
- **Borrador de notas en `sessionStorage` = riesgo residual aceptado (S-006):** las notas (PII potencial) se
  guardan en claro en el almacenamiento del navegador para no perderlas en un remount; mitigado por **purga al
  cambiar de identidad** (FR-010), ámbito **same-origin** de la SPA y limpieza al enviar. No se cifra (SPA sin
  clave de cliente); se acepta y documenta como residual (alternativa: persistir solo un flag "hay borrador").
- **Simetría del 404 uniforme (S-007) = del backend, no de FE-2:** la indistinguibilidad ajena/inexistente la
  garantiza el contrato/backend; el front **solo mapea** los códigos recibidos (no infiere existencia por el
  código). Si hubiera asimetría 422/404 para `orderId` inexistente + payload inválido, es un tema de
  contrato/backend, fuera del alcance de esta feature de front (se anota como observación).
- Panel de gate **estándar de front**: los 3 (cínico/spec-theater/rbac) + **`revisor-front-a11y-ux`**.
- Sin cambios de backend ni de `contracts/`. Fuera de alcance: FE-3 (dispatcher), FE-4 (supervisor+IA).
