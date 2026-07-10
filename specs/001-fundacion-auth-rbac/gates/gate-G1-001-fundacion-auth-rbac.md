# Gate G1 (tras clarify) — 001-fundacion-auth-rbac

**Fecha:** 2026-07-10 · **Panel:** revisor-cinico, auditor-spec-theater, revisor-rbac-seguridad
**Veredicto:** 🔴 **BLOQUEADA** (3 BLOQUEANTES). Criterio de avance: 0 bloqueantes.

## 🔴 BLOQUEANTES (resolver antes de /speckit-plan)

| ID | Tema | Origen | Resolución propuesta |
|----|------|--------|----------------------|
| **B1** | **Rotación del refresh token** sin definir (¿single-use? ¿detección de reuso?) | H-001 / S-005 | Refresh **rota en cada uso** (single-use); detectar reuso de un refresh revocado → **revocar toda la familia** de sesión (OWASP). |
| **B2** | **Access token no se invalida en logout** (JWT stateless válido ≤15 min) — contradice AS1.3 | S-001 | Aclarar AS1.3: logout **revoca la sesión (refresh)**; el access **expira solo** en ≤15 min. Invalidación inmediata (denylist/session-version) → **stretch** (backlog). |
| **B3** | **Duración del bloqueo** (lockout) no cuantificada | T-001 | Bloqueo **15 min, ventana fija**, auto-expira; NO se extiende con intentos durante el bloqueo (evita DoS). |

## 🟠 ALTAS (resolver ahora; casi todas de seguridad)

- **A1** (H-004/S-002): contador de lockout **por usuario resuelto** (no por string) + **throttle uniforme** para identifiers inexistentes (mismo timing/respuesta → no enumeración).
- **A2** (H-003): validar **estado de cuenta (activo/bloqueado)** en cada refresh y validación de access (no solo en login).
- **A3** (S-003): **regla 403 vs 404** fundacional: 403 = el rol nunca puede esa acción; 404 = recurso existe pero fuera de tu alcance/no tuyo (no revelar). La heredan 002+.
- **A4** (H-005): **test de colisión** email/username (FR-001b) — añadir a trazabilidad.
- **A5** (H-002/S-006): definir "dispositivo" (FR-003b) y si el refresh se **liga** al origen (o es solo informativo → stretch).
- **A6** (H-006): FR-009 con doble de prueba → marcar **re-certificación en 002** (no falsa cobertura).
- **A7** (T-002): **lista cerrada** de cabeceras de seguridad (HSTS max-age, CSP, X-Content-Type-Options, X-Frame-Options…).

## 🟡 MEDIAS → backlog (no bloquean)

- H-007 login de cuenta bloqueada (401 uniforme) · H-008 disparadores 429/422 · H-009 ventana fija vs deslizante (resuelto en B3) · H-010 idempotencia de logout (204) · H-011 verificación de política de contraseña en seed · S-004 técnica CSRF (plan) · S-006 binding de refresh · S-007 PII (identifier) fuera del pipeline de logs (FR-014).

## Siguiente paso

Aplicar B1–B3 + A1–A7 a la spec → **re-ejecutar G1** hasta 0 bloqueantes. MEDIAS en `docs/backlog.md`.

---

## Re-ejecución G1 (tras fixes + STRIDE) — ✅ PASS

**Veredicto: 0 BLOQUEANTES** (los 3 previos resueltos). El panel sacó nuevas ALTAS; se resolvieron las
de seguridad/base en la spec y el resto → backlog:

- **Resueltas en spec (round 2):** oráculo de enumeración vía 429 (throttle también a identifiers
  inexistentes + timing <50 ms) · carrera de rotación de refresh (ventana de gracia, FR-004d) ·
  invalidación inmediata del access en compromiso confirmado (FR-004b) · modelo de estado
  `locked_until`/`disabled` · filas de trazabilidad de FRs nuevos.
- **→ backlog:** perf de verificación de estado por-request (H-004), wording "por dispositivo" sin
  binding (H-005/BL-008), access en body vs cookie + alcance CSRF (H-007, decidir en /plan), nota
  "base-ready" no testeable (T-002).

**G1 cerrado.** Siguiente: `/speckit-checklist` → `/speckit-plan` (G2 tras `/speckit-analyze`).

## Supervisión neutral (auditor-brief vs brief) — ✅ A_LA_ALTURA

Complementaria a la adversarial: cobertura fiel de la parte auth/RBAC del brief (RBAC doble capa,
401/403, "rápido y seguro" cuantificado); sin contradecir "stack libre"; proporcionada (rotación/
anti-enumeración/cabeceras = "cómo" justificado; resto en backlog/stretch). Único PARCIAL esperado:
"ver sus órdenes" → diferido a 002 (001 es fundación de identidad). **Veredicto: lista para /plan.**

---

## Re-ejecución G1 (tras `/speckit-clarify` con decisiones de nivel spec del G2) — ✅ PASS

**Contexto:** el G2 (spec↔plan↔tasks) había revelado que ciertas decisiones eran de **nivel spec**. En
vez de parchear plan/tasks a mano (que rompía coherencia), se revirtieron los artefactos y se re-lanzó el
flujo por skills. `/speckit-clarify` incorporó al spec: orden 401-antes-403 (**FR-018**), logout no
idempotente (**FR-003**), reset de ventana de lockout (**FR-011**), regla 403/404 determinista con orden
rol→pertenencia (**FR-017**), identidad de estado disabled vs locked_until (**FR-004c**), ventana de
gracia = ≤10 s (Assumptions), replay idempotente (**FR-004d**), relectura de rol (**FR-004**), códigos de
error acotados a 001 (**FR-013**), y SC-003 medido sobre refresh.

**Vueltas del panel (spec-freeze → re-G1):**
- v1: 3 BLOQUEANTES (SC-003⟂FR-003; FR-018⟂tabla de contrato; ventana de gracia sin valor) + ALTAS.
- v2: resueltos; nuevo BLOQUEANTE (FR-003 "stretch" ⟂ FR-004b "SHALL invalidar").
- v3: **0 BLOQUEANTES** — cínico APROBADA_CON_COMENTARIOS, spec-theater APROBADA, rbac APROBADA.

**MEDIAS → backlog:** BL-020 (atomicidad contador lockout), BL-021 (UX reintento logout), BL-022
(invalidación inmediata de rol). **G1 cerrado (PASS).** Siguiente: re-lanzar `/speckit-plan` y `/speckit-tasks`.
