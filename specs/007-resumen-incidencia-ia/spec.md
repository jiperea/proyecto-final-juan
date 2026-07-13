# Feature Specification: Resumen de incidencia por IA

**Feature Branch**: `007-resumen-incidencia-ia`

**Created**: 2026-07-13

**Status**: Draft

**Input**: Brief Func #5 — "Asistente de IA que resume la incidencia de una orden". Roadmap #006 (rama física
`007-resumen-incidencia-ia`). Un **supervisor** solicita un **resumen en lenguaje natural** de una orden en
`pending_review` (a partir de las **notas de ejecución** y los **metadatos de evidencia** registrados en 005),
para apoyar su decisión de aprobar/rechazar (006). La IA **nunca inventa ni filtra PII** (Constitution VIII),
anclado a **eval** (promptfoo). Reutiliza auth/RBAC de 001 y el alcance de visibilidad del supervisor de 006.

> **Alcance MVP (Constitution XV — specs pequeñas)**: sólo la **generación del resumen bajo demanda** para el
> supervisor. **No** incluye: **procedencia/staleness** del resumen (stretch, Constitution v1.5.0); persistencia/
> caché del resumen o del prompt; reentrenamiento o fine-tuning; resúmenes de otros roles o estados; traducción/
> i18n. **Sin API de pago** (Constitution §Stack, regla del programa): el proveedor IA es por **CLI**
> (`AI_PROVIDER=claude-cli`) en dev; los tests **mockean** el proveedor (deterministas, sin red).

## Clarifications

### Session 2026-07-13

- Q: ¿Qué dispara de forma determinista el fallback "evidencia insuficiente"? → A: **notas vacías tras saneo
  Y 0 evidencias** (ambas condiciones). Caso **degenerado/defensivo**: una orden en `pending_review` normal
  tiene notas obligatorias (005) y ≥1 evidencia, así que el fallback sólo se activa si el contenido a resumir
  está realmente ausente (p. ej. invariante de 005 rota). Testeable con golden case + test de integración.
- Q: ¿Alcance de la minimización de PII antes de enviar al proveedor? → A: **allowlist estructural** — se envía
  **solo** el texto de las notas de ejecución + metadatos de evidencia (**conteo** y **content_type**). **Nunca**
  `object_ref`, uuids (`assigned_to`/actor/ids) ni identificadores. El texto de las notas va tal cual (es la
  descripción de la incidencia). La no-fuga en la **salida** la cubre el eval (FR-004/SC-003); la redacción por
  patrones del texto libre es **stretch/endurecimiento** (no MVP).
- Q: ¿Límite y ventana del rate-limit del endpoint IA? → A: **10 peticiones / 60 s por usuario** (reutiliza el
  patrón in-memory de rate-limit de 001); superar → `429` con `Retry-After`.

### Session 2026-07-13 — remediación gate G1

> Decisiones que resuelven los hallazgos del panel G1 (informe `gates/gate-G1-007-resumen-incidencia-ia.json`).

- Q: **(B1, Constitution VIII)** ¿La minimización de PII de entrada es MVP u obligatoria? → A: **obligatoria
  (MVP)** — NO stretch. Antes de enviar al proveedor: **allowlist estructural** (nunca `object_ref`/uuids/ids)
  **+ redacción por patrones** del texto de notas (emails, teléfonos, matrículas, DNI/NIF, direcciones) →
  marcadores `[REDACTED]`. Un **detector de PII compartido** se reutiliza en la salida (FR-004).
- Q: **(B2/A4)** ¿Qué hace el saneo defensivo si detecta PII en la salida? → A: usa el **mismo detector**; si
  detecta PII en la salida del proveedor → la trata como **no conforme → fallback `sufficient=false`**, **nunca**
  devuelve un resumen alterado in-place (preserva la medición de fidelidad y no engaña al supervisor).
- Q: **(B3)** ¿Qué dispara el fallback "no inventa" de forma alcanzable? → A: (1) el **proveedor declara**
  `sufficient=false` cuando no puede resumir con fidelidad (golden cases de notas pobres/telegráficas — realista),
  **o** (2) **corto-circuito determinista** del caso degenerado (notas vacías tras saneo Y 0 evidencia) → fallback
  **sin** llamar al proveedor.
- Q: **(B4/A3)** ¿Timeout y mapeo de fallos del proveedor? → A: **timeout duro 10 000 ms**. **timeout / fallo de
  proceso → `503`**; **salida vacía o no-conforme (vacía tras trim, o con PII detectada) → `200` fallback**.
  "Conforme" = texto no vacío tras trim, dentro del timeout, sin PII.
- Q: **(A1)** ¿Precedencia de errores? → A: **`401` → `403` (rol) → `429` (rate-limit por usuario) → `404` (no
  visible) → proveedor (`503` timeout/error | `200` resumen/fallback)**. El `429` (por usuario) precede al `404`
  para no filtrar existencia del recurso.
- Q: **(A2/A7)** ¿Trazabilidad de acceso? → A: **sí** — evento de acceso **sin PII** `{actor, orderId, timestamp,
  outcome=success|fallback|error}` por cada solicitud (espíritu Constitution XI; detección de abuso). No persiste
  prompt ni resumen.
- Q: **(A5)** ¿Umbral de contenido mínimo? → A: **no numérico** — la suficiencia la **juzga el proveedor** (B3);
  con notas pobres devuelve `sufficient=false` en vez de alucinar.
- Q: **(A6)** ¿Esquema exacto de salida? → A: **`IncidentSummaryResponse { summary: string|null, sufficient:
  boolean }`** (sin "o equivalente"; `summary` nulo/omitido cuando `sufficient=false`).
- Q: **(M3)** ¿Cota del resumen? → A: `summary` **≤ 1200 caracteres** (además del eval de fidelidad).
- Q: **(M5)** ¿Proveedor en producción? → A: en dev `claude-cli` local; el de **producción queda por decidir** y,
  si transmite a un tercero, exige **TLS 1.2+ y DPA** (Constitution IX) — deuda **BL-072**.
- Q: **(ronda 2 — PII de nombres/direcciones)** Los nombres/direcciones en texto libre no se redactan con regex de
  forma fiable. → A: **enfoque por capas** — (i) PII **estructurada** (email/teléfono/DNI-NIF/matrícula) se redacta
  **determinísticamente por patrones** → `[REDACTED]`; (ii) **nombres/direcciones** (texto libre) se mitigan con
  **instrucción explícita al proveedor** (no reproducir datos personales) **+ chequeo de no-fuga en la salida**
  (FR-004: si aparece PII del caso → fallback). El residual de texto libre es **best-effort (prompt+eval)**, no
  regex; se documenta como tal. Se alinean FR-003/FR-004/SC-003 a este alcance.
- Q: **(ronda 2 — FR-013 alcance)** ¿El evento de acceso cubre los intentos denegados? → A: **sí** — se emite para
  **toda** petición con actor autenticado, en cualquier resultado de la precedencia FR-012: `outcome ∈ {success,
  fallback, error, denied}` (`denied` cubre 403/404/429). El `401` (sin actor) lo cubre la capa de auth de 001.
- Q: **(ronda 2 — FR-014 desbordamiento)** ¿Recortar o fallback si el resumen supera 1200? → A: **no conforme →
  fallback** (`sufficient=false`), determinista (mismo trato que FR-004/FR-010); nunca se trunca a mitad (evita
  cortar una frase y arriesgar la fidelidad).
- Q: **(ronda 3 — honestidad del chequeo de salida)** ¿FR-004(b) es un chequeo de runtime? → A: **no** — en
  producción solo corre el detector **estructural** (FR-004a); nombres/direcciones se cubren por
  prompt-instruction (entrada) + **verificación en el eval** con golden cases de literales conocidos (G3),
  documentado como best-effort (**BL-073**). Se reformula FR-004 para no prometer un chequeo de runtime
  inexistente.
- Q: **(ronda 3 — causas del fallback)** ¿Se distinguen las causas de `sufficient=false`? → A: la **respuesta al
  cliente** permanece genérica, pero el **evento de acceso** (FR-013) distingue `fallback_insufficient` (calidad
  de datos) de **`blocked_pii`** (señal de seguridad) para valor forense (XI), sin filtrar la causa al cliente.
- Q: **(ronda 3 — trazabilidad FR-004)** → A: se separa en **FR-004(a)** (test unitario determinista, CI) y
  **FR-004(b)** (golden case de promptfoo, gate G3) para no dar por cubierta la mitad de nombres/direcciones con
  solo el vitest.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resumen fiel para decidir la revisión (Priority: P1)

Un supervisor, ante una orden en `pending_review`, solicita un **resumen** de la incidencia. El sistema minimiza
la PII de las notas/evidencia, se lo pasa al asistente y devuelve un resumen **fiel** (solo lo que consta en la
evidencia) que el supervisor lee antes de aprobar/rechazar.

**Why this priority**: Es el valor central del asistente (Brief Func #5): acelerar la revisión con un resumen de
confianza. Sin fidelidad, el resumen es inútil o peligroso.

**Independent Test**: Con una orden en `pending_review` con notas y ≥1 evidencia, el supervisor pide el resumen y
recibe un texto que **solo** refleja hechos presentes en las notas/evidencia (verificado por eval `faithfulness
≥ 0.90`, `tasa_alucinacion ≤ 0.05`).

**Acceptance Scenarios**:

1. **Given** una orden en `pending_review` con notas y evidencia, **When** el supervisor pide el resumen, **Then**
   recibe `200` con un resumen en lenguaje natural fiel a la evidencia y **sin PII cruda**.
2. **Given** el mismo caso, **When** se evalúa la salida con los golden cases, **Then** `faithfulness ≥ 0.90` y
   `tasa_alucinacion ≤ 0.05`.

---

### User Story 2 - No inventar cuando falta evidencia (Priority: P1)

Cuando la orden **no tiene evidencia/notas suficientes** para un resumen fiable, el asistente **no inventa**:
declara explícitamente "evidencia insuficiente" en lugar de fabricar un resumen.

**Why this priority**: La regla no-negociable de Constitution VIII ("la IA nunca inventa"). Un resumen inventado
sobre una orden sin datos induciría al supervisor a una decisión errónea.

**Independent Test**: Con una orden en `pending_review` **sin notas útiles** (o marcada como insuficiente), el
resumen devuelto es el **fallback determinista** "evidencia insuficiente", nunca un resumen fabricado (golden
case de fallback en el eval).

**Acceptance Scenarios**:

1. **Given** una orden sin contenido suficiente, **When** se pide el resumen, **Then** la salida es el mensaje de
   **fallback** ("evidencia insuficiente") y **no** un resumen inventado.
2. **Given** el proveedor IA devuelve algo no conforme al contrato (vacío/ininteligible/timeout), **When** se
   procesa, **Then** el sistema responde con el fallback controlado, nunca propaga basura ni PII.

---

### User Story 3 - Solo el supervisor, sin fuga de PII, con límite de uso (Priority: P2)

Solo el rol **supervisor** puede pedir el resumen, y solo de órdenes visibles en `pending_review`. La PII se
**minimiza antes** de enviarla al proveedor, el resumen **nunca** se registra con PII cruda en logs, y el
endpoint está **rate-limited** para acotar abuso/coste.

**Why this priority**: Control de acceso + protección de PII (Constitution VIII/IX/XI) + robustez operacional
(rate-limit, Constitution X). Protege datos de cliente y el proveedor.

**Independent Test**: Un technician/dispatcher recibe `403`; una orden fuera de `pending_review` → `404`; el
`object_ref` crudo y los identificadores de cliente **no** aparecen en la petición al proveedor, en el resumen ni
en los logs; superar el límite de peticiones → `429`.

**Acceptance Scenarios**:

1. **Given** un technician o dispatcher, **When** pide el resumen, **Then** `403` (o `401` sin auth), sin llamar
   al proveedor.
2. **Given** una orden en estado ≠ `pending_review` o inexistente, **When** el supervisor pide el resumen,
   **Then** `404` genérico (no-enumeración), sin llamar al proveedor.
3. **Given** un supervisor que supera el límite de peticiones en la ventana, **When** pide otro resumen, **Then**
   `429` con `Retry-After`, sin llamar al proveedor.

---

### Edge Cases

- **Proveedor: timeout (>10 s) / fallo de proceso** → `503`; **salida vacía tras trim / no conforme / con PII**
  → `200` fallback (`sufficient=false`). Nunca cuelga ni filtra detalle del proveedor (FR-010).
- **Notas con PII estructurada** (email, teléfono, matrícula, DNI/NIF): se **redactan por patrones** (`[REDACTED]`)
  **antes** de enviar (FR-003b). **Nombres/direcciones** (texto libre): instrucción al proveedor + chequeo de
  salida (FR-003c/FR-004); residual best-effort documentado.
- **`object_ref`**: **nunca** se envía al proveedor ni aparece en el resumen/logs (solo metadatos: conteo,
  `content_type`).
- **Salida del proveedor con PII pese a la redacción de entrada**: el detector la marca **no conforme** →
  fallback `sufficient=false` (no se devuelve resumen alterado in-place, FR-004).
- **`orderId` malformado**: `404` genérico (coherente con 005/006).
- **Orden sin notas ni evidencia** (**violación de invariante / defensivo**, no un flujo alcanzable normal — 005
  exige notas + ≥1 evidencia antes de `pending_review`): corto-circuito determinista → fallback (FR-002 caso 2).
- **Cambio de estado en vuelo**: la visibilidad se comprueba al inicio; el resumen es **asesor/efímero/read-only**
  (no escribe), así que un cambio de estado mientras el proveedor responde no corrompe nada — **no** se re-valida
  al responder (aceptado).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (resumen): WHEN un supervisor solicita el resumen de una orden en `pending_review` y el proveedor lo
  considera **suficiente** THE sistema SHALL devolver `200` con `sufficient=true` y un `summary` en lenguaje
  natural **fiel** a las notas/evidencia. **No** hay umbral numérico de "contenido mínimo": la suficiencia la
  **juzga el proveedor** (FR-002) — con notas pobres devuelve `sufficient=false` en vez de alucinar de relleno.
- **FR-002** (fallback no-inventa): WHEN (1) el **proveedor declara** que no puede resumir con fidelidad
  (`sufficient=false`) **o** (2) se cumple el **corto-circuito determinista** (notas vacías tras saneo **Y** 0
  evidencias, sin llamar al proveedor) THE sistema SHALL devolver el **fallback** (`sufficient=false`,
  `summary=null`, "evidencia insuficiente"), **nunca** un resumen fabricado. El caso (1) cubre el escenario
  realista (notas pobres/telegráficas); el (2) es el degenerado/defensivo (invariante de 005 rota).
- **FR-003** (minimización de PII de entrada — OBLIGATORIA, Constitution VIII; enfoque por capas): WHEN se
  construye la petición al proveedor THE sistema SHALL: (a) **allowlist estructural** — enviar únicamente el texto
  de notas + metadatos de evidencia (`conteo`, `content_type`), **nunca** `object_ref`, uuids
  (`assigned_to`/actor/ids) ni identificadores; (b) **redacción determinista por patrones** de la PII
  **estructurada** del texto de notas (emails, teléfonos, matrículas, DNI/NIF) → `[REDACTED]`; **y** (c) para
  **nombres/direcciones** (texto libre, sin patrón regex fiable) una **instrucción explícita al proveedor** de no
  reproducir datos personales, **complementada** por el chequeo de salida de FR-004. El residual de texto libre
  (nombres/direcciones) es **best-effort (prompt + eval)**, no una garantía regex; documentado como tal. La
  detección estructural la hace un **detector compartido** reutilizado en FR-004.
- **FR-004** (no-fuga de PII en salida): WHILE se procesa la salida del proveedor THE sistema SHALL aplicar en
  **producción** el **detector estructural** de FR-003 (email/teléfono/DNI-NIF/matrícula/`object_ref`); si detecta
  PII estructurada, THE sistema SHALL tratar la salida como **no conforme → fallback `sufficient=false`**,
  **nunca** devolver un resumen alterado in-place. Para **nombres/direcciones** (texto libre) **no** existe un
  chequeo de runtime en producción (no hay campo estructurado de identidad de cliente contra el que comparar): su
  cobertura es (i) la instrucción al proveedor (FR-003c, entrada) y (ii) la **verificación en el eval** con
  golden cases de literales conocidos (ausencia del literal en la salida = oráculo binario determinista), que el
  gate G3 ejecuta. Es un residual **best-effort** honesto (ver **BL-073**), no una garantía de runtime.
- **FR-005** (no persistir PII / no logs, incl. canales indirectos): THE sistema SHALL **no** persistir el prompt
  ni el resumen con PII cruda, y **nunca** registrar en logs el contenido de notas, `object_ref` ni el resumen
  (solo `id`/metadatos). Incluye **canales indirectos**: la invocación del proveedor CLI **no** debe filtrar el
  prompt por `stderr` del subproceso ni por trazas de error/APM (se captura/suprime `stderr`; el prompt nunca
  aparece en una traza).
- **FR-006** (RBAC de rol): WHEN un usuario con rol distinto de supervisor solicita el resumen THE sistema SHALL
  responder `403` `FORBIDDEN_ROLE` (o `401` si no autenticado), **sin** llamar al proveedor.
- **FR-007** (no-enumeración / estado): WHEN el supervisor apunta a una orden inexistente, con `orderId`
  malformado, o en estado ≠ `pending_review` THE sistema SHALL responder `404` genérico e indistinguible, **sin**
  llamar al proveedor (mismo alcance de visibilidad que 006).
- **FR-008** (rate-limit): WHEN un supervisor supera **10 peticiones de resumen en una ventana de 60 s** (por
  usuario) THE sistema SHALL responder `429` con `Retry-After`, **sin** llamar al proveedor (reutiliza el patrón
  in-memory de rate-limit de 001).
- **FR-009** (proveedor por CLI, sin API de pago): THE sistema SHALL usar el proveedor IA por **CLI**
  (`AI_PROVIDER=claude-cli`) en dev y **mockear** el proveedor en los tests (deterministas, sin red).
- **FR-010** (proveedor no disponible / timeout): WHEN el proveedor **excede el timeout duro de 10 000 ms** o
  **falla el proceso** THE sistema SHALL responder `503` (error controlado, sin colgar ni filtrar detalle);
  WHEN el proveedor devuelve una salida **vacía tras trim o no conforme** (o con PII, FR-004) THE sistema SHALL
  responder `200` con **fallback** (`sufficient=false`). "Conforme" = texto no vacío tras trim, dentro del
  timeout, sin PII detectada.
- **FR-011** (contrato de salida): THE respuesta `200` SHALL ser exactamente **`IncidentSummaryResponse
  { summary: string | null, sufficient: boolean }`** (`summary` = texto cuando `sufficient=true`; `null` cuando
  `sufficient=false`); los errores usan `{code, message, details, agent_action}`. El cliente distingue
  resumen/fallback por `sufficient`, sin heurística de texto.
- **FR-012** (precedencia determinista de errores): WHEN una petición incumple varias condiciones THE sistema
  SHALL aplicar el orden único **`401` (no autenticado) → `403` (rol ≠ supervisor) → `429` (rate-limit por
  usuario) → `404` (orden no visible en `pending_review`) → proveedor (`503` timeout/fallo | `200`
  resumen/fallback)**. El `429` (por usuario) precede al `404` para no filtrar la existencia del recurso.
- **FR-013** (trazabilidad de acceso — sin PII): WHEN una petición de resumen llega con **actor autenticado**
  (cualquier resultado de la precedencia FR-012) THE sistema SHALL emitir un **evento de acceso** `{actor,
  orderId, timestamp, outcome}` **sin PII** (ni prompt ni resumen ni `object_ref`), con `outcome ∈ {success,
  fallback_insufficient, blocked_pii, error, denied}` — donde **`blocked_pii`** (salida bloqueada por PII
  detectada, FR-004) es una **señal de seguridad** distinguible del **`fallback_insufficient`** (calidad de
  datos, FR-002) y de `denied` (403/404/429). La **respuesta al cliente** permanece genérica (`sufficient=false`,
  sin revelar la causa); la distinción vive **solo** en el evento de acceso server-side (valor forense, XI).
  `401` (sin actor) lo cubre la capa de auth de 001.
- **FR-014** (cota del resumen): WHEN el `summary` generado supera **1200 caracteres** THE sistema SHALL tratarlo
  como **no conforme → fallback `sufficient=false`** (determinista, mismo trato que FR-004/FR-010); **nunca** se
  trunca a mitad (evita cortar una frase y arriesgar la fidelidad). Un resumen conforme tiene `≤ 1200`.

### Key Entities *(include if feature involves data)*

- **Order**: entidad de 002a; solo se **lee** (estado + visibilidad). No se muta.
- **OrderExecutionNotes / OrderEvidence** (de 005): **fuente** del resumen; se **leen** (notas + metadatos), se
  **minimizan** antes del proveedor. No se mutan.
- **Resumen de incidencia** (efímero): `{ summary: string|null, sufficient: boolean }`; **no se persiste** con
  PII (MVP).
- **Petición al proveedor** (efímera): prompt **minimizado** (allowlist + redacción por patrones); **no se
  persiste**, no se loguea (ni por `stderr`/APM).
- **Evento de acceso** (FR-013): `{actor, orderId, timestamp, outcome}` **sin PII** — sí se registra (rastro
  forense), a diferencia del prompt/resumen.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (fidelidad): en los golden cases con contenido suficiente, el resumen obtiene **`faithfulness ≥
  0.90`** (LLM-as-judge sobre la evidencia) y **`tasa_alucinacion ≤ 0.05`**.
- **SC-002** (fallback): el 100% de los golden cases de **evidencia insuficiente** producen el fallback "evidencia
  insuficiente" y **0** resúmenes fabricados.
- **SC-003** (no-fuga de PII, entrada y salida): **0** apariciones de la PII del golden case en el prompt enviado,
  la salida devuelta y los logs/`stderr` (aserción de eval + grep negativo). PII **estructurada**
  (email/teléfono/DNI-NIF/matrícula/`object_ref`) → garantía **determinista** (redacción por patrones, FR-003b).
  **Nombres/direcciones** → verificados con **golden cases de literales conocidos** (prompt-instruction + chequeo
  de salida, FR-003c/FR-004); residual de texto libre no cubierto por regex documentado como best-effort.
- **SC-004** (RBAC + no-enumeración): el 100% de las peticiones de roles ≠ supervisor son `403`/`401`, y el 100%
  de las peticiones sobre órdenes fuera de `pending_review` son `404`; en **ninguno** se llama al proveedor.
- **SC-005** (rate-limit): superar el límite produce `429` con `Retry-After` en el 100% de los casos, sin llamar
  al proveedor.
- **SC-006** (robustez del proveedor): el 100% de los **timeout (>10 s)/fallo de proceso** producen `503`, y el
  100% de las **salidas vacías/no-conformes** producen `200` fallback; 0 cuelgues, 0 fugas de detalle.
- **SC-007** (trazabilidad de acceso): el 100% de las solicitudes de resumen emiten un evento de acceso
  `{actor, orderId, timestamp, outcome}` **sin PII** (0 apariciones de prompt/resumen/`object_ref` en el evento).

## Contrato (OpenAPI) *(obligatorio si hay endpoints — Constitution II)*

- **Fichero**: extiende `contracts/orders.openapi.yaml` (OpenAPI 3.1), reutilizando `bearerAuth`/`ErrorResponse`.
- **Endpoint** (propuesta; forma exacta en `/speckit-plan`):
  - `summarizeOrderIncident` — `POST /orders/{orderId}/ai-summary` — roles `supervisor` — respuestas
    `200 / 401 / 403 / 404 / 429 / 503`.
- **Esquema** `IncidentSummaryResponse` `{ summary: string | null, sufficient: boolean }` (`summary=null` cuando
  `sufficient=false`); errores `{code, message, details, agent_action}` (`FORBIDDEN_ROLE` 403, genérico 404,
  `RATE_LIMITED` 429, `SERVICE_UNAVAILABLE` 503). El `200` incluye tanto resumen como fallback (distinguidos por
  `sufficient`).
- **Por qué POST**: la generación tiene coste/efecto (rate-limit, llamada al proveedor); no es un GET cacheable.

## Trazabilidad (RF → endpoint → tarea → test) *(obligatorio — Constitution VI)*

| FR | Endpoint(s) | Tarea(s) | Test(s) |
| ---- | ----------- | -------- | ------- |
| FR-001 | `summarizeOrderIncident` | T0xx | `should return faithful summary for sufficient content` |
| FR-002 | `summarizeOrderIncident` | T0xx | `should fallback (no-invent) when content insufficient` |
| FR-003 | `summarizeOrderIncident` | T0xx | `should minimize PII before calling provider` |
| FR-004(a) estructural | `summarizeOrderIncident` | T0xx | `should block/fallback on structured PII in output (unit, CI)` |
| FR-004(b) nombres/dir | `summarizeOrderIncident` | T0xx | `eval golden-case: known name/address absent from output (promptfoo, G3)` |
| FR-005 | `summarizeOrderIncident` | T0xx | `should never log notes/object_ref/summary` |
| FR-006 | `summarizeOrderIncident` | T0xx | `should 403 when non-supervisor requests summary` |
| FR-007 | `summarizeOrderIncident` | T0xx | `should 404 generic when order not in pending_review` |
| FR-008 | `summarizeOrderIncident` | T0xx | `should 429 when rate limit exceeded (no provider call)` |
| FR-009 | `summarizeOrderIncident` | T0xx | `should use mocked provider in tests (no network)` |
| FR-010 | `summarizeOrderIncident` | T0xx | `should 503 on timeout/process-failure, 200 fallback on empty/non-conforming` |
| FR-011 | `summarizeOrderIncident` | T0xx | `should return {summary:string|null, sufficient} per contract` |
| FR-012 | `summarizeOrderIncident` | T0xx | `should apply precedence 401→403→429→404→provider` |
| FR-013 | `summarizeOrderIncident` | T0xx | `should emit PII-free access event per request` |
| FR-014 | `summarizeOrderIncident` | T0xx | `should bound summary to ≤1200 chars` |

> Se mantiene en `docs/traceability.md`. Los `T0xx` los asigna `/speckit-tasks`.

## Eval de objetivos (promptfoo) *(obligatorio — Constitution VIII y XIV)*

- **Componente IA** → `/evals/ia-resumen/golden-cases.yaml` + `/evals/promptfooconfig.yaml`: `faithfulness ≥
  0.90`, `tasa_alucinacion ≤ 0.05`, **no-fuga de PII**, **fallback** (evidencia insuficiente → no inventa).
- **SC medibles** → `/evals/sc/007-resumen-incidencia-ia.yaml`.
- El gate **G3** ejecuta `npx promptfoo eval`; si un umbral no se cumple, **falla** (bloqueante).
- Provider de promptfoo = **`claude -p`** (CLI, sin API de pago), coherente con `AI_PROVIDER=claude-cli`.

## Assumptions

- **Fuente del resumen** = notas de ejecución (005) + metadatos de evidencia (conteo, `content_type`); **nunca**
  el `object_ref` crudo ni el binario (que es #007-evidencia/otro).
- **Resumen efímero**: se genera bajo demanda y **no se persiste** (evita PII at-rest; procedencia/staleness es
  stretch). Cada petición regenera.
- **Visibilidad** = la del supervisor en 006 (`pending_review`); reutiliza el mismo criterio de 404.
- **Rate-limit** reutiliza el patrón de 001 (login) adaptado al endpoint IA.
- **Determinismo en test**: el proveedor se mockea; la fidelidad/alucinación/no-fuga se verifican con promptfoo
  (`claude -p`) sobre golden cases, fuera del `vitest run` unitario.
- **Idioma del resumen**: español (coherente con los mensajes del sistema).
- **Alcance del supervisor (A7)**: cualquier supervisor puede resumir cualquier orden en `pending_review`
  (heredado de 006, unicidad de rol; sin aislamiento por equipo). El **evento de acceso** (FR-013) mitiga el
  riesgo de exfiltración al dejar rastro forense de quién consultó qué; la segmentación por ámbito es backlog.
- **Dedup de peticiones concurrentes (M2)**: fuera de MVP; el doble-clic/reintento lo acotan el rate-limit
  (FR-008) y el cliente. Cada petición cuenta como una.
- **Proveedor en producción (M5)**: en dev es `claude-cli` **local**; el proveedor de **producción queda por
  decidir** y, si transmite el prompt a un tercero, exige **TLS 1.2+ y DPA** (Constitution IX) — deuda trazada
  **BL-072** (obligatorio resolver antes de un despliegue real que use un proveedor remoto).
- **Residual de PII en texto libre (BL-073)**: nombres/direcciones no se redactan por regex en runtime (solo
  prompt-instruction + eval). Endurecimiento futuro (NER/servicio de detección de nombres, o campo estructurado
  de identidad de cliente contra el que verificar en salida) = **BL-073**, con condición de revisión antes de un
  despliegue con datos reales sensibles. No es una aceptación permanente indefinida.
