# Research — 002a Order + listado por rol (Phase 0)

> Decisiones técnicas (Decisión · Rationale · Alternativas). La spec ya congeló el comportamiento (G1);
> aquí se fija la mecánica de diseño, reutilizando 001.

## D1 · Política de alcance centralizada (`orderScopeFor`)

- **Decisión**: una única función de dominio `orderScopeFor(role, userId): OrderScope` que devuelve el
  **predicado de filtrado** (estados permitidos + si exige `assigned_to == userId`). El repositorio la traduce
  a la consulta; el handler NUNCA reimplementa la regla inline (FR-016, Principio IV).
  - technician → `{ assignedToSelf: true, statuses: [assigned, in_progress, pending_review] }`
  - supervisor → `{ assignedToSelf: false, statuses: [pending_review] }`
  - dispatcher → `{ assignedToSelf: false, statuses: [assigned, in_progress] }`
- **Rationale**: fuente de verdad reutilizable por 003/004/005; evita drift de reglas de autorización.
- **Alternativas descartadas**: filtro inline por endpoint (duplicación, drift); WHERE ad-hoc por rol.

## D2 · `version` (concurrencia optimista) base-ready

- **Decisión**: columna `version` (int, default 0) en `Order` **ahora** (Const. v1.5.1: diseña la base). El
  comportamiento `If-Match`→409 es **stretch** de 003/004 (BL-001); 002a no lo ejercita.
- **Rationale**: evita un `ALTER TABLE ADD COLUMN version` retroactivo sobre tabla poblada.
- **Alternativas descartadas**: añadirla en 003/004 (retrofit destructivo, prohibido por la constitution).

## D3 · Autorización: allowlist default-deny

- **Decisión**: `authorize` para `orders:list` con **allowlist** `{dispatcher, technician, supervisor}`; un
  principal fuera del allowlist → **403** (fail-secure). Orden auth(401)→autorización(403), reutilizando
  `authenticate` (Bearer) de 001. Verificable a nivel de política (rol no reconocido → 403) sin usuario semilla.
- **Rationale**: RBAC por defecto-deny (Principio IV); testeable aunque los 3 roles reales listen.
- **Alternativas descartadas**: 200 vacío para rol sin permiso (enmascara autorización); denylist (frágil).

## D4 · Sin superficie de query que amplíe alcance

- **Decisión**: `GET /v1/orders` en 002a **no acepta parámetros** de alcance; los no reconocidos se ignoran y
  el filtro de rol se aplica SIEMPRE en AND en el backend (no sobrescribible). Test: `?assigned_to=otro` /
  `?status=closed` no cambian el resultado.
- **Rationale**: cierra el vector de escalada por manipulación de query (FR-008/015, S-005).

## D5 · Orden determinista

- **Decisión**: `ORDER BY created_at DESC, id DESC`. El tiebreak por `id` (UUID v7, ordenable por tiempo pero
  único) hace el orden reproducible ante `created_at` iguales (evita tests flaky) — FR-012.
- **Rationale**: determinismo verificable; sin paginación en 002a (FR-013).

## D6 · PII de `title`/`description` fuera de logs

- **Decisión**: la redacción de logs de 001 (FR-014 de 001) se **extiende** para no serializar `title`/
  `description` de `Order` (texto libre con posible PII de cliente). El handler no vuelca el cuerpo de la
  respuesta a logs. `assigned_to` se expone como **UUID opaco** (sin resolver nombre) — FR-007/017.
- **Rationale**: "logs sin PII" también para datos de cliente; minimización por rol diferida (BL-046).

## D7 · Datos semilla del listado

- **Decisión**: ≥30 órdenes repartidas por rol/estado reutilizando los usuarios semilla de 001: varias
  `assigned`/`in_progress` de distintos technicians, varias `pending_review`, **≥1 `draft` con `assigned_to`
  null**, **≥1 `closed` propia de un technician** (para probar que se excluye). Invariante: nunca
  `assigned`/`in_progress` con `assigned_to` null.
- **Rationale**: cubre los casos de FR-002/003/004 + edge (draft/closed excluidas) de forma determinista.
