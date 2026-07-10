# Gate G2 (tras analyze) — 001-fundacion-auth-rbac

**Fecha:** 2026-07-10 · **Panel (acumulativo):** revisor-cinico, auditor-spec-theater,
revisor-rbac-seguridad, revisor-consistencia
**Veredicto inicial:** 🔴 **BLOQUEADA** (4 BLOQUEANTES tras consolidación). Criterio de avance: 0 bloqueantes.

## 🔴 BLOQUEANTES

| ID | Tema | Origen (agentes) | Resolución |
|----|------|------------------|------------|
| **B1** | Semántica RBAC del `rbacProbe` sin definir (regla rol×alcance + datos propio/ajeno) → FR-017/SC-002 no testeables de verdad | H-001, S-002 | Definir en spec la **regla concreta** del probe + **datos semilla** (ids propio/ajeno) → 200/403/404 deterministas. |
| **B2** | CSRF de `logout` sin **403** en contrato ni test; falta cabecera CSRF → 400 vs 403 | K-001, H-008, S-006 | Contrato: añadir **403** a `logout`; `X-CSRF-Token` **no `required`** (lo valida el middleware → 403). Regla de orden 401→403. Tareas de contract+integration test de CSRF en logout. |
| **B3** | Metodología de medición P95 indefinida (SC-001/SC-005/FR-011): N, perfil, punto de medición | T-001, T-002, T-003 | Fijar en spec (§Método de medición) y en T051/T052: **N≥200**, **secuencial con warm-up**, **instrumentación server-side**; P95 por-grupo; diferencia de timing = |P95(inexistente)−P95(inválido)|. |
| **B4** | Ventana de gracia del refresh (FR-004d) explotable: replay no atado al solicitante | S-001 | Acotar FR-004d (replay solo devuelve el sucesor cacheado del **mismo token**, ventana corta) + **assumption de integridad TLS** en threat-model + hardening de binding → backlog. |

## 🟠 ALTAS (resueltas ahora — seguridad/base)

- **A1** (S-003): orden **sesión antes que CSRF** → sin sesión = 401, con sesión y CSRF inválido = 403 (coherencia FR-017).
- **A2** (S-004, H-009, H-003): FR-004c/b — verificación por-request con caché (TTL≤30s) y **fallback a BD en cache-miss** (cierra el hueco de reinicio para revocación de familia, que es durable en `Session.revoked_at`); add al set **síncrono** tras el commit de revocación; "inmediata" reformulada. Lockout durable en `User.locked_until` (sobrevive reinicio).
- **A3** (S-005): `ErrorResponse.details` **no** puede contener datos que distingan cuenta inexistente vs credenciales inválidas (anti-enumeración) + contract test de contenido.
- **A4** (H-004): al expirar `locked_until`, **reset** de `count`/`window_start`; nº de fallos frescos para re-bloquear = umbral completo (5).
- **A5** (H-002): el Independent Test de US1 usa el `rbacProbe`/middleware; se reordena — el middleware auth mínimo entra en Foundational para que US1 sea testeable sin depender de US3.
- **H-006**: rotación **atómica** (`UPDATE ... WHERE rotated_at IS NULL`) para ganar la carrera de refresh concurrente; perdedora → gracia (mismo resultado), no reuso.
- **K-002 / K-004**: añadir tareas de test **[Red]** para cabeceras de seguridad (FR-012) y correlation-id (FR-014).

## 🟡 MEDIAS → backlog

- H-005 (wiring evento lockout→SessionState; `disabled_at` sin fuente en 001) · H-007 (TTL/rotación de `csrf_token`) · K-003/BL-016 (health/ready contract test) · K-005 (código 400 de FR-013: acotado N/A como 409) · T-004 (umbral de cobertura STRIDE en T057) · binding de refresh a cliente (hardening B4) · store distribuido para revocación/rate-limit (multi-instancia, DevOps).

## Estado

Aplicando B1–B4 + ALTAS a spec/research/data-model/tasks/contract/threat-model → **re-ejecutar G2** hasta 0 bloqueantes.

---

## Re-ejecución round 2 — el panel destapó contradicciones introducidas por la remediación

El re-run verificó B1–B4 y ALTAS como **cerrados**, pero encontró **nuevos** bloqueantes creados por los
propios fixes (valor del panel):

- **R2-B1** (H-001): FR-004d re-servía el refresh "en claro" que el data-model dice no persistir →
  **resuelto**: caché **efímera en memoria** de gracia (≤10 s), no en BD (spec/research/data-model).
- **R2-B2** (H-002): contrato `logout` "204 idempotente" contradecía FR-018 → **resuelto**: logout
  **no idempotente** a nivel de token (2º logout con cookie revocada → 401); idempotencia por request-id → backlog.
- **R2-B3** (T-001): matriz STRIDE sin columna de severidad para el umbral de T057 → **resuelto**:
  añadida **columna Severidad**; T057 = 100% de amenazas BLOQUEANTE/ALTA con test.
- **R2-B4** (K-101/H-004/H-005/K-106): adenda fuera del grafo + T065 colisión/ruta no-contractual →
  **resuelto**: **T039/T040 → Foundational**, **T034/T042 (`me`) → US1** (recurso contractual del
  Independent Test), **T065 eliminada**, sección Dependencies reescrita.
- **ALTAS round 2 resueltas:** fail-closed en fallback BD (H-003), csrf_token en `refresh` 200 del contrato
  (H-006), redacción de tokens en logs (S-001b), test refresh 401-antes-403 (T066/K-102), threat-model
  actualizado + colisión ID S-004 eliminada (K-103), HMAC del identifier (S-104), FR-017b en T035/T043 (K-104).
- **MEDIAS → backlog/aclaradas:** T-002 (SC-001 hereda método), S-103 (details en 403/404 — resuelto en contrato).

→ **Re-ejecutar round 3** para confirmar 0 bloqueantes.
