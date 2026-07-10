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

<!-- Nuevos ítems se añaden abajo a medida que analyze/gates los generen. -->
