# Gate G3 — 001 Fundación Auth/Sesión/RBAC (tras /speckit-implement)

**Fecha:** 2026-07-11 · **Panel:** revisor-implementacion, auditor-spec-theater, revisor-rbac-seguridad,
revisor-consistencia, revisor-cinico (acumulativo G1+G2+G3) · **Criterio:** 0 BLOQUEANTES.

**Veredicto: BLOQUEADA.** 96 tests en verde, pero el panel adversarial detecta **incongruencias que los
tests no cubrían** (bugs reales + tests que no distinguen implementación correcta de incorrecta).

## BLOQUEANTES (deben cerrarse para pasar G3)

| ID | Tipo | Descripción | Fuente |
|----|------|-------------|--------|
| B1 | **BUG** | **Orden CSRF (FR-018)**: `csrf()` sólo comprueba *ausencia* de cookie; con cookie caducada/revocada/disabled + CSRF inválido devuelve **403** en vez de **401**. Divergencia contrato↔código. | K-001, S-001, (spec-theater) |
| B2 | **BUG** | **rotateAtomic TOCTOU (D6/FR-004)**: el `updateMany` sólo filtra `rotatedAt:null`, NO re-verifica `session.revoked_at` en la misma operación → un logout concurrente no cierra el refresh. | H-001 |
| B3 | **BUG** | **login() sin fail-closed**: no tiene try/catch (a diferencia de refresh/logout); BD caída → petición colgada / unhandledRejection en vez de 503. | H-003 |
| B4 | **TEST** | **FR-005 401 uniforme de refresh**: ningún test compara `code`/cuerpo entre las 4 causas (caducado/revocado/reuso/disabled) → un `code` distinto por causa pasaría verde. | T-001 |
| B5 | **TEST** | **FR-004b invalidación inmediata e2e**: falta el test HTTP real (login→reuso→access aún vigente→me→401). La trazabilidad lo cita pero no existe. | T-002 |
| B6 | **TEST** | **Concurrencia de rotación (FR-004)**: no hay test concurrente que ejercite la carrera logout↔refresh (cubre B2). | H-002 |

## ALTA (no bloquean; a backlog o cerrar en esta ronda)

- **A1 (H-004/H-009)**: `me` y `rbacProbe` (y en general) sin try/catch → fail-closed incompleto ante BD caída; no hay wrapper async central.
- **A2 (H-005)**: `DB_QUERY_TIMEOUT_MS` validado pero **nunca aplicado** (sin timeout de query) → degradación de BD cuelga, no falla rápido.
- **A3 (H-006)**: `User.lockedUntil` se **lee** pero nunca se **escribe**; lockout sólo in-memory → un reinicio resetea bloqueos (SC-004 tras restart).
- **A4 (K-002/T-004/T-005)**: SC-001/SC-005 y paridad de timing (<50ms) sin test (T057/T058).
- **A5 (T-003)**: re-check de gracia con revocación concurrente no ejercitado por test.

## MEDIA/BAJA (backlog)

- S-002 (no se registra causa interna del 401/lockout/reuso → sin traza forense).
- S-003 (`CSRF_HMAC_SECRET` exigido pero no usado; double-submit puro).
- H-007 (filas RefreshToken huérfanas por carrera + posible 401 espurio al perdedor de gracia).
- T-006 (401 de logout uniforme de *contenido* no comparado).
- K-003 (puertos AccountStatePort/ProbeResourceRepositoryPort no listados en plan/tasks).
- K-004 (ruta de T030 en tasks.md desalineada: `auth-credentials.spec.ts` → `login.spec.ts`).
- K-005/K-007 (matriz de trazabilidad incompleta; SC sin tarea).
- H-008 (doble `check()` en login).

## Nota de proceso

El gate cumple su función: **96 tests verde ≠ implementación correcta**. Los BLOQUEANTES B1-B3 son bugs
que ningún test detectaba; B4-B6 son tests que no distinguen correcto de incorrecto (spec-theater). La
remediación se hace por skills (re-plan/tasks si aplica) y TDD (test Red que reproduzca el bug → fix).

---

## Re-ejecución tras remediación — VEREDICTO: APROBADA ✅ (0 BLOQUEANTES)

**Fecha:** 2026-07-11. Panel de re-verificación (4 revisores) sobre los fixes + coherencia de artefactos:

| Revisor | 1ª ronda | Re-run |
|---------|----------|--------|
| auditor-spec-theater | BLOQUEADA | ✅ APROBADA (B4/B5/B6 distinguen correcto/incorrecto) |
| revisor-implementacion | BLOQUEADA | ✅ APROBADA (B1-B6 cerrados, sin regresión) |
| revisor-consistencia | BLOQUEADA | ✅ APROBADA (K-001/K-003/K-004/K-005 resueltos) |
| revisor-rbac-seguridad | BLOQUEADA | ✅ APROBADA (S-001 cerrado en 2ª iteración) |

**Ronda extra (S-001):** la re-verificación halló que B1 cubría caducada/revocada pero **no `disabled`**;
se cerró por el bucle SDD completo (research D2 + tasks T055/Phase 7 → código `RefreshSessionValidity`
+ `AccountStatePort` → tests unit/integration → re-gate). Demuestra el valor del patrón: un fix incompleto
detectado y corregido antes de dar el gate por bueno.

**Estado final:** 110 tests verde · typecheck + eslint + cobertura por capa OK · **0 BLOQUEANTES**.
ALTA/MEDIA residuales en backlog (BL-035..045). **G3 PASA.** Feature 001 lista para merge.
