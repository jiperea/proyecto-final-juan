# Backlog (mejoras diferidas)

> Registro **vivo** de mejoras que NO bloquean el avance pero conviene no perder. Se nutre de:
> hallazgos **MEDIUM/LOW** de `/speckit-analyze`, hallazgos **no bloqueantes** de los gates adversariales
> (ALTA/MEDIA), y refuerzos marcados **stretch** en la constitution/roadmap.
>
> Criterio de bloqueo (proceso): **CRITICAL/HIGH (analyze) o BLOQUEANTE (gates) detienen**; el resto → aquí.

## Cómo se usa

- Cada entrada: `[ID] (origen: analyze/gate/stretch · feature · severidad) — descripción → cuándo abordarla`.
- Al planificar una feature, revisar si algún ítem del backlog le aplica y **promoverlo** a su spec/tasks.

## Ítems

### Refuerzos stretch (de constitution v1.5.x)

- **BL-001** (stretch · 003/004 · ALTA) — Idempotencia (idempotency-key) + concurrencia optimista
  (If-Match→409). *Base-ready ahora (columna `version`), comportamiento diferido.*
- **BL-002** (stretch · 002/004 · ALTA) — Auditoría **forense**: registro de accesos denegados (401/403/404)
  + evidencia versionada por intento. *La tabla de auditoría se diseña ya en 002 (base-ready).*
- **BL-003** (stretch · 006 · MEDIA) — Resumen IA con **procedencia + staleness** (versión de evidencia,
  marcado de obsoleto).

### Diferido a fase DevOps

- **BL-004** (DevOps · MEDIA) — CI/GitHub Actions completo: migraciones en CI, branch protection, dashboards.
- **BL-005** (DevOps/analítica · BAJA) — Colector OTLP + Grafana para métricas de tokens (hoy: RTK/ccusage local).

### Ideas de implementación (futuro)

- **BL-006** (idea · MEDIA) — Agentes de revisión especializados por lenguaje/front/back en G3.
- **BL-007** (idea · BAJA) — Adaptador MCP sobre promptfoo si se quiere reutilizar la eval fuera de Claude.

### Seguridad (stretch · de G1/STRIDE de 001)

- **BL-008** (stretch · 001 · MEDIA) — Binding del refresh token a dispositivo/origen (mitiga robo).
- **BL-009** (stretch · 001 · MEDIA) — Throttle por IP además del lockout por cuenta (anti-DoS).
- **BL-010** (stretch · 001 · MEDIA) — Invalidación inmediata del access en logout (denylist/session-version).
- **BL-011** (MEDIA · 001) — Idempotencia de logout (204); disparadores 429/422; verificación de política
  de contraseña en el seed; técnica CSRF concreta (a decidir en /plan).

### G1 round 2 (001) — diferidos

- **BL-012** (001 · MEDIA) — Perf de verificación de estado de cuenta por-request vs solo en refresh
  (FR-004c): definir mecanismo (cache/TTL) para no romper SC-005; decidir en /plan.
- **BL-013** (001 · MEDIA) — Aclarar/quitar "por dispositivo" mientras no haya binding (H-005); hoy
  "sesiones concurrentes" sin noción de dispositivo enforced.
- **BL-014** (001 · MEDIA) — Access token en body (Bearer) vs cookie y alcance CSRF correspondiente
  (H-007) → decidir en /plan (contrato).

### Analyze 001 (G2 previo) — MEDIUM (no bloquean)

- **BL-015** (001 · analyze · MEDIA) — Contrato `logout`: sus respuestas listan 204/401 pero exige CSRF
  double-submit (como `refresh`, que sí declara 403). Decidir en implementación: añadir **403** a `logout`
  en el contrato **o** documentar que el fallo CSRF en logout mapea a 401 (coherencia contrato↔middleware T049).
- **BL-016** (001 · analyze · MEDIA) — `health`/`ready` son operationIds del contrato sin **contract test**
  dedicado (Const. II: contract test por operationId×código). Añadir aserciones de contrato en T020 o tarea propia.

### Gate G2 (001) — diferidos y hardening

- **BL-017** (stretch · 001 · MEDIA) — **Binding del replay de gracia** (FR-004d) a la identidad del
  cliente (nonce/fingerprint), para no depender solo de la asunción TLS (S-001). Hardening.
- **BL-018** (DevOps · 001 · MEDIA) — **Store distribuido** (p. ej. Redis) para el set de revocación y el
  contador de rate-limit, al pasar a **multi-instancia** (hoy in-memory single-instance tras puertos).
- **BL-019** (001 · analyze · BAJA) — FR-013: el código **400** (body no-JSON) queda **acotado** como no
  usado en 001 (validación → 422); reconsiderar si algún caso lo requiere (paralelo al 409 N/A).

### Gate G1 re-run (001, tras clarify G2) — MEDIAS

- **BL-020** (001 · G1 · MEDIA) — **Atomicidad del contador de lockout** ante intentos concurrentes
  (transacción/lock) para que la fuerza bruta en paralelo no evada el umbral (FR-011). Mecánica → `/plan`.
- **BL-021** (001 · G1 · BAJA) — **UX de reintento de logout**: tras timeout de red, un 2º logout da 401
  (no idempotente); el frontend debería tratar 401-en-logout como "ya deslogueado" (éxito). Concierne al
  cliente (fuera del backend de 001).
- **BL-022** (stretch · 001 · MEDIA) — **Invalidación inmediata del rol** (cortar el access en curso ante
  cambio/degradación de rol); hoy el cambio de rol se propaga en ≤15 min (TTL del access). Requiere el
  mismo mecanismo de invalidación inmediata que FR-004b (session-version).

### Gate G2 post-propagación (001) — MEDIA

- **BL-023** (stretch · 001 · MEDIA) — **Paridad de timing en el 401 de `refresh`** entre causas
  (reuso-detectado es más lento por el write de revocación de familia). Hoy solo se garantiza uniformidad
  de **contenido** (FR-005); la de timing se difiere por su coste sobre SC-005. Prioridad: media (002).

### Gate G2 (corrección logout) — MEDIA

- **BL-024** (stretch · 001 · MEDIA) — **Terminación forzosa de sesiones al marcar `disabled`** (revocar
  activamente todas las sesiones/refresh de la cuenta en el momento del disable, en vez de solo bloqueo
  reactivo por login/refresh/validación). Hoy el acceso se corta reactivamente (FR-002b/FR-004c); esto
  sería contención proactiva ante incidente. Requiere trigger de administración (fuera de 001).
- **BL-025** (stretch · 001 · BAJA) — **Señal de auditoría** cuando una cuenta `disabled` ejecuta `logout`
  con éxito (204) — visibilidad forense sin filtrar nada al cliente (vía correlation-id/FR-014).

- **BL-026** (001 · G2 · BAJA) — Cliente: ante 401 en reintento de `refresh` (gracia perdida por revocación
  concurrente), re-loguear en vez de reintentar el mismo token (evitar bucle). Concierne al frontend.

- **BL-027** (001 · G2 · BAJA) — Logout que dispara FR-004b (token rotado fuera de gracia) invalida el
  access de **otras pestañas propias** del mismo `sid` (falso positivo benigno en multi-tab tardío). Aceptado;
  afinar señal si se añade monitorización. Etiquetar en logs "reuse vía logout" distinto de "vía refresh".
- **BL-028** (001 · G2 · BAJA) — Documentar en threat-model el **vector real** que justifica detección de
  reuso (dispositivo comprometido / robo físico / fuga de store), dado que la captura en tránsito se asume
  fuera de alcance (TLS). No cambia 001; mejora la trazabilidad del modelo de amenazas.

### Gate G2 PASS (001) — residuales ALTA/MEDIA (no bloquean; a cerrar en /implement o enmienda menor)

- **BL-029** (001 · G2 · ALTA) — Uniformidad del **401 en endpoints Bearer** (`me`/`rbacProbe`): que `code`/
  `message` no distingan token expirado / firma inválida / familia revocada / disabled (oráculo para quien
  ya posee un access robado). Extender la uniformidad de FR-005 al camino Bearer (rbac S-001).
- **BL-030** (001 · G2 · ALTA) — Timing del **429 (lockout) vs 401**: fijar orden (locked_until antes/después
  del hash) y paridad de timing 429↔401 para no reabrir oráculo por latencia (cínico H-002).
- **BL-031** (001 · G2 · ALTA) — Alcance del **422 por JSON malformado**: aclarar si aplica solo a `login`
  o a todo endpoint con body; si a todos, declarar 422 en el contrato de refresh/logout/me/rbacProbe (consistencia K-001).
- **BL-032** (001 · G2 · MEDIA) — Tests de concurrencia/edge dirigidos: ventana commit-BD↔caché-gracia;
  seed de cuenta disabled+locked combinada; descripción OpenAPI de logout que refleje D12 (token rotado→FR-004b).
- **BL-033** (stretch · UI 002+ · ALTA) — Garantizar en la futura UI que el **access vive en memoria** (no
  localStorage) — base del reparto XSS/CSRF (D1); test de arquitectura frontend cuando exista (cínico H-001).

### Gobernanza (ADR-0004)

- **BL-034** (DevOps/gobernanza · ALTA) — **Consolidación fundación→`main`**: llevar constitution, docs,
  agentes, plantillas, extensiones y CI a `main`, y **re-basar `001`** desde `main` como feature pura
  (salda la deuda de ramas; ver ADR-0004). Tarea propia, cuando se aparque el diseño de 001.

### Gate G3 (001) — ALTA/MEDIA (no bloquean; los BLOQUEANTES se corrigen en la ronda de remediación)

- **BL-035** (001 · G3 · ALTA) — **Fail-closed completo**: `me`/`rbacProbe` (y handlers async en general) sin
  try/catch → BD caída puede colgar la petición; falta un wrapper async central que garantice 401/503 (H-004/H-009).
- **BL-036** (001 · G3 · ALTA) — **`DB_QUERY_TIMEOUT_MS` no se aplica** (Prisma sin timeout de query) → la
  degradación de BD no falla rápido; sustenta SC-005 y el fail-closed acotado en el tiempo (H-005/T-002).
- **BL-037** (001 · G3 · ALTA) — **Durabilidad del lockout**: `User.lockedUntil` se lee pero no se escribe;
  el lockout vive sólo en memoria → un reinicio resetea bloqueos (SC-004 tras restart). Decidir: persistir o
  documentar como límite del slice single-instance (Redis, BL-018) + quitar el campo vestigial (H-006).
- **BL-038** (001+002a · G3 · ALTA) — **Tests de rendimiento** método D9: 001 SC-001/SC-005 + |P95|<50ms
  (T057/T058) y **002a SC-002 P95<300ms de `GET /v1/orders` (T017)**. Diferidos; sin ellos los criterios de
  rendimiento quedan sin verificación automatizada (K-002/T-004/I-005 de 001; I-003/K-001 de 002a).
- **BL-039** (001 · G3 · ALTA) — **Test de re-check de gracia con revocación concurrente** (T-003): forzar
  `revoked_at`/disabled dentro de la ventana y comprobar que el hit de gracia NO sirve el trío (401).
- **BL-040** (001 · G3 · MEDIA) — **Traza forense**: registrar la causa interna del 401/lockout/reuso con
  `user_id` (el `req.log` se adjunta pero no se usa) para detectar fuerza bruta/robo (S-002, FR-005/002b/004b).
- **BL-041** (001 · G3 · MEDIA) — **`CSRF_HMAC_SECRET` sin uso**: o se liga el csrf_token con HMAC(sid) o se
  elimina el secreto exigido en arranque (discrepancia diseño↔implementación, S-003).
- **BL-042** (001 · G3 · MEDIA) — **Carrera de refresh**: filas RefreshToken huérfanas por perdedor de carrera
  + posible 401 espurio si el perdedor lee la gracia antes del `set` del ganador (H-007).
- **BL-043** (001 · G3 · MEDIA) — **Deriva de trazabilidad**: ✅ **CERRADO en la ronda de remediación**
  (K-003 puertos añadidos a plan/tasks; K-004 ruta T030 corregida; K-005 traceability completada). Queda
  pendiente sólo el mapeo STRIDE→test y quickstart e2e (T065/T066, I-007, K-007 SC sin tarea).
- **BL-044** (001 · G3 · BAJA) — Doble `check()` en login (H-008); 401 de logout uniforme de *contenido* no
  comparado (T-006).

### Re-gate G3 (001) — MEDIA

- **BL-045** (001 · G3 re-run · MEDIA) — **Divergencia validador↔refresh** (S-002): `RefreshSessionValidity`
  no replica la lógica de gracia/reuso de `refresh()` para un token rotado FUERA de gracia → en el camino
  CSRF devuelve 403 (sesión "válida") donde una llamada real a `refresh()` daría 401 + revocaría familia.
  No hay bypass de CSRF ni escalada; es un 2º oráculo que puede divergir. Unificar la fuente de verdad si
  se endurece. Aceptado no-bloqueante.

### Gate G1 (002a) — diferidos (no bloquean; cerrados en spec o a futuro)

- **BL-046** (002a · G1 · MEDIA) — **Minimización/redacción de contenido** de `Order.title`/`description` por
  rol (texto libre con posible PII de cliente): en 002a solo se garantiza que **no se loguea** (FR-017); la
  redacción por rol (p. ej. dispatcher que gestiona sin ver detalle de cliente) se difiere (S-003/S-004).
- **BL-047** (003 · G1 · BAJA) — **Visibilidad del dispatcher para reasignar tras rechazo** (H-010): con la
  regla de 002a el dispatcher ve `in_progress` (a donde vuelve una orden rechazada por 005), así que el caso
  queda cubierto; revisar en 003 si necesita ampliar alcance a `pending_review`.
- **BL-049** (futuro · MEDIA) — **Aislamiento por equipo/región** (S-007): supervisor/dispatcher ven TODAS las
  órdenes de su estado sin sub-ámbito; asumido org única. Introducir scoping por equipo cuando aplique.
- **BL-048** (gobernanza · MEDIA) — **Reconciliar constitution v1.5.x** (H-005): tras partir 002 en 002a/002b,
  la frase "la tabla de auditoría se diseña en el data model de 002" pasa a **002b**; 002a deja el ancla
  (`Order.id` + `version`). Ajustar la redacción del constitution en **rama de gobernanza** (regla v1.7.1),
  no en esta feature.

### Gate G1 (002b) — diferidos / gobernanza

- **BL-050** (gobernanza · MEDIA) — **Reconciliar constitution: concurrencia optimista** (H-002): distinguir en
  el texto que la **consistencia por `version` (no lost-update)** es *correctness* (mandatory) y que solo la
  **exposición `If-Match`→409** al cliente es *stretch* (003/004). Ajustar en rama de gobernanza (v1.7.1).
- **BL-051** (002b+ · MEDIA) — **Cifrado en reposo / control de lectura de `OrderAudit.reason`** (S-005): PII
  saneada pero en claro; definir cifrado de columna y qué roles pueden leer `reason` (vs metadatos).
- **BL-052** (futuro · MEDIA) — **Auditoría forense de accesos denegados** (BL-002, entidad separada de
  `OrderAudit`, H-003): tabla propia `DeniedAccessAudit` (sin `from/to_status`); diseñar cuando se aborde.
- **BL-053** (002b · BAJA) — **Hardening bypass de `status`** (H-004): además del único-punto-de-escritura en
  dominio, valorar un trigger/constraint de BD que impida mutar `orders.status` fuera de `applyTransition`.
- **BL-054** (futuro · BAJA) — **Cancelación de orden / límite de rechazo** (H-010): transición `*→cancelled` y
  tope al ciclo `pending_review↔in_progress`; caso de negocio futuro.

### Gate G1 (002b, re-entrada tras remediación de G2) — diferidos

- **BL-055** (002b+ · MEDIA) — **Procedimiento correctivo de PII / mantenimiento de `order_audit`**
  (G1:H-005/G1:H-008): con trigger append-only + `onDelete: Restrict`, una PII mal saneada o una migración
  estructural legítima no tienen vía dentro del sistema. Definir una **migración controlada** (deshabilitar
  trigger → purgar/anonimizar o backfill → rehabilitar, con revisión y registro). Riesgo residual documentado
  hasta implementarlo. **Añadido (G1 re-run S-006)**: control **técnico** (no sólo de proceso) que detecte la
  ausencia del trigger — health-check de arranque que verifique su presencia y/o bloqueo de migraciones
  destructivas en producción.
- **BL-056** (003/004/005 · MEDIA) — **Defensa en profundidad del contrato de `applyTransition`**
  (G1:S-003/S-004/S-005 + re-run): `actor_id` como objeto de actor autenticado tipado (no `string`), tipo que
  distinga `guard` obligatorio vs opcional (olvido detectable en compilación/test), y control operativo del
  `down` de la migración del trigger. **Añadidos del re-run**: cada consumidora que requiera pertenencia DEBE
  incluir en su gate un test "`guard` ausente ⇒ la transición no procede sin control adicional" (S-005);
  **normalizar/acotar el side-channel de tiempo** entre los 4 casos de FR-003 tras el colapso de FR-009 (S-004).
  Escalaría el contrato del slice 002b (XV) → abordar al integrar 003/004/005.
- **BL-057** (004 · MEDIA) — **Campo de evidencia en `OrderAudit`** (consist-G2:K-006, Constitution XI): añadir
  `evidence_ref`/hash a la auditoría cuando 004 (ejecución) introduzca evidencia (fotos/notas). En 002b las
  transiciones no llevan evidencia; desviación temporal aceptada y reconciliada (análoga a BL-050).
- **BL-058** (gobernanza · MEDIA) — **Formalizar en `spec-template.md` la convención de secciones delegadas**:
  `## Trazabilidad` (RF→…→test) se mantiene en `docs/traceability.md`, y `## Eval de objetivos (promptfoo)` sólo
  aplica a features con IA/SC-promptfoo (las de dominio puro verifican con Vitest). Hoy 002a/002b ya siguen esta
  convención de facto; dejarla explícita en la plantilla evita que un gate/lector futuro la lea como deriva. Va
  en la **rama `chore/foundation-governance`** (ADR-0004 / constitution v1.7.1), NUNCA en una rama de feature.

<!-- Nuevos ítems se añaden abajo a medida que analyze/gates los generen. -->
