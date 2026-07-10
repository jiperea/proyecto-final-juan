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

<!-- Nuevos ítems se añaden abajo a medida que analyze/gates los generen. -->
