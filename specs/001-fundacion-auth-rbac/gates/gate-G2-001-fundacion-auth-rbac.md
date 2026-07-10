# Gate G2 (tras analyze) — 001-fundacion-auth-rbac

**Disparado por:** hook `after_analyze` → `speckit.gate.run` (comando de la extensión `speckit-gate`).
**Panel acumulativo (G1 + revisor-consistencia):** revisor-cinico, auditor-spec-theater,
revisor-rbac-seguridad, revisor-consistencia.

---

## Ejecución sobre el conjunto regenerado + propagado (2ª tanda) — 🔴 BLOQUEADA

Veredicto global = el más restrictivo (cínico: BLOQUEADA). **1 BLOQUEANTE + 3 ALTA + varias MEDIA.**

### 🔴 BLOQUEANTE

| ID | Tema | Origen | Resolución propuesta |
|----|------|--------|----------------------|
| **H-001** | El **fallback-a-BD** (research D3) solo re-verifica revocación de **familia**, no `disabled`; `T060` no prueba que `disabled` sobreviva a reinicio/cache-miss → cuenta deshabilitada recupera acceso al expirar TTL≤30s | cínico | research D3: el fallback consulta **también `User.disabled_at`**; `T060` añade caso "usuario disabled sigue cortado tras reinicio/cache-miss". |

### 🟠 ALTA (resolver ahora — seguridad)

- **S-001** (rbac): `password` en claro no está en la lista de redacción (T020) ni prohibido en `details` de 422 → riesgo de contraseña en logs/APM/respuesta. → añadir `password` a redacción (T017/T020) + regla "details nunca incluye password" (contrato + T062).
- **S-002** (rbac): "3 secretos distintos" (JWT/CSRF/LOCKOUT) sin **validación fail-fast** ni test. → config (D8/T019) añade chequeo *pairwise-distinct*; `T015` añade caso.
- **H-002** (cínico): FR-004c ambiguo — ¿`refresh` verifica estado por caché o por BD directa? → aclarar: **validación per-request (hot path) = caché+fallback**; **`refresh` (no hot path) = BD autoritativa**. No es contradicción; separar la redacción.

### 🟡 MEDIA

- **S-003** (rbac): orden `disabled` vs CSRF en refresh/logout no fijado → el chequeo de estado de sesión (incl. disabled/familia) va **antes** que CSRF (parte del gate de "sesión válida", FR-018). Aclarar.
- **H-003** (cínico): cobertura simétrica del probe — falta caso 404-por-alcance para **supervisor** (solo se cubre dispatcher). → seed `probe-C` `in_scope=[dispatcher]`.
- **H-004** (cínico): el 401 de `refresh` garantiza uniformidad de **contenido** pero no de **timing** (reuso-detectado es más lento por el write) → extender paridad de timing a refresh (FR-005) o backlog.
- **T-001** (spec-theater): la columna Severidad del STRIDE no tiene **rúbrica objetiva** → añadir rúbrica (BLOQUEANTE/ALTA/MEDIA) a threat-model.
- **K-001/K-002** (consistencia): `quickstart.md` desactualizado (falta `LOCKOUT_HMAC_SECRET`; probe con 2 casos en vez de 3). → actualizar quickstart.
- **K-003** (consistencia): `data-model` §Mapa entidad→FR no incluye **FR-002b** en `User`/`LoginAttempt`. → añadir.

### Lo confirmado como CERRADO por el panel
Escalada de rol / doble capa RBAC / 401-antes-403 / anti-enumeración login / unicidad a nivel de esquema /
revocación de familia acotada / FR-017b real (no fantasma) / método P95 / contrato 403 en refresh y logout.

## Decisión (§4 del command)
≥1 BLOQUEANTE → **GATE FAIL**. Se invoca `remediador` (propone, no aplica; separación de funciones) →
propuestas en `gate-G2-...-propuestas.md`. **Avance detenido** (no se commitea) hasta resolver y re-ejecutar.

---

## Re-ejecución de cierre (tras remediación iterada por skills) — ✅ **GATE G2 PASS**

Tras varias rondas de remediación **vía skills** (clarify→G1, plan, tasks) sobre los hallazgos sucesivos,
el panel acumulativo de cierre (revisor-cinico, auditor-spec-theater, revisor-rbac-seguridad,
revisor-consistencia) devuelve **0 BLOQUEANTES**. Todos confirmaron que los hallazgos previos
(H-001 fallback/disabled, S-001/S-002 password/secretos, H-002 régimen, H-003 fixture, T-001 rúbrica,
CSRF/logout, grace re-check, fail-closed 503, D12 logout+token rotado) están **resueltos y propagados de
forma coherente** en spec/plan/tasks/research/data-model/contrato.

**Hallazgos residuales (ALTA/MEDIA, NO bloquean — Constitución XIII: se avanza con 0 bloqueantes):**
→ `docs/backlog.md` **BL-029..033** (uniformidad 401 Bearer, timing 429-vs-401, alcance 422, tests de
concurrencia/edge, access-en-memoria de la futura UI). Se abordan en `/implement` o como enmienda menor.

**Nota de proceso:** el gate se disparó por el hook `after_analyze` → `speckit.gate.run`; la remediación se
hizo regenerando/afinando artefactos con las skills (no a mano) y con separación de funciones (panel valida,
autor/remediador proponen). El bucle convergió: ~8 rondas en 0 bloqueantes, con el panel produciendo solo
refinamientos ALTA/MEDIA decrecientes.

**G2 CERRADO (PASS).** Siguiente: `/speckit-implement` (G3).
