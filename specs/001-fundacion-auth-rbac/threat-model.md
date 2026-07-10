# Threat Model (STRIDE) — 001 Fundación auth/sesión/RBAC

**Fecha:** 2026-07-10 · **Alcance:** autenticación, sesión y RBAC (superficie de seguridad de FieldOps).
Convención: features sensibles de seguridad llevan STRIDE (constitution). Cada amenaza → mitigación →
FR/test; lo no cubierto → backlog.

## Matriz STRIDE

> **Severidad** por amenaza (denominador del umbral de T065 = 100% de amenazas **BLOQUEANTE/ALTA** con
> test `Txxx` asociado). Los `Txxx` refieren a tareas de `tasks.md`.
>
> **Rúbrica de severidad (objetiva, resuelve T-001/G2):**
> - **BLOQUEANTE**: bypass de autenticación/autorización, escalada de rol, o exposición de
>   credenciales/secretos; explotable sin autenticación o por cualquier autenticado sin restricción.
> - **ALTA**: fuga de información sensible (PII, existencia de recursos, oráculo de timing) o DoS dirigido,
>   pero requiere condiciones adicionales (ya autenticado, ventana temporal) y no compromete integridad.
> - **MEDIA**: mitigable con higiene/observabilidad, o corresponde a un stretch/backlog explícito, sin
>   impacto directo inmediato en confidencialidad/integridad/disponibilidad del núcleo.

| Categoría | Amenaza | Severidad | Mitigación | FR / test |
|-----------|---------|-----------|------------|-----------|
| **S**poofing | Robo de credenciales; adivinación; suplantar sesión | ALTA | argon2id; login uniforme; lockout; refresh opaco HttpOnly | FR-001/002/011 · T030/T031/T033 |
| **S**poofing | Reutilizar refresh robado | BLOQUEANTE | Rotación single-use atómica + revocar familia comprometida | FR-004/004b · T049/T050 |
| **S**poofing | Cuenta `disabled` se re-loguea | ALTA | Login verifica disabled (401 uniforme, cuenta para lockout) | FR-002b · T032 |
| **T**ampering | Alterar el access token | ALTA | JWT firmado (validación de firma) | FR-007 · T025/T044 |
| **T**ampering | CSRF sobre refresh/logout | ALTA | CSRF double-submit + SameSite=Strict; orden sesión→CSRF | FR-012/018 · T051/T055 |
| **T**ampering | Doble rotación / falso reuso por carrera | ALTA | Rotación atómica `WHERE rotated_at IS NULL` + gracia | FR-004/004d · T049/T053 |
| **R**epudiation | Negar acciones / accesos | MEDIA | Auditoría (stretch); correlation-id | FR-014 · BL-002 |
| **I**nfo disclosure | Enumeración de usuarios (login/lockout/404) | ALTA | 401 uniforme; timing <50ms; 429 indistinguible; details sin oráculo | FR-002/002b/009/011 · T058/T052 |
| **I**nfo disclosure | Tokens/secretos en logs o APM | ALTA | Redacción de Authorization/Set-Cookie/*_token/identifier | FR-014 · T017/T020 |
| **I**nfo disclosure | Fuga de existencia/propiedad vía details (403/404) o causa 401 refresh | MEDIA | details sin ownerId/alcance; 401 refresh uniforme | FR-005/017 · T052 |
| **I**nfo disclosure | PII en reposo | MEDIA | Cifrado en reposo (constitution IX) — más en 002+ | Constitution IX |
| **D**oS | Fuerza bruta / spam de login | ALTA | Lockout ventana fija + rate-limit | FR-011 · T031/T062 |
| **D**oS | Lockout como DoS dirigido | MEDIA | Ventana fija no extensible; throttle IP → BL-009 | FR-011 · BL-009 |
| **D**oS | Arranque en estado inconsistente | ALTA | Config fail-fast | FR-016 · T015 |
| **D**oS | Fallback a BD caído en validación por-request | MEDIA | Fail-closed (401/503) | FR-004c · T061 |
| **E**levation | Saltarse RBAC forzando la API | BLOQUEANTE | RBAC en backend; 401/403/404 | FR-007/008/009/010 · T044 |
| **E**levation | Regla de prueba RBAC ambigua (403 vs 404) | ALTA | Regla determinista FR-017b + fixture pertenencia | FR-017/017b · T043/T042 |
| **E**levation | Sesión comprometida/`disabled` sigue con access vigente | ALTA | FR-004c per-request (disabled + familia revocada, write-through) | FR-004c/004b · T050/T060 |
| **E**levation | 403 vs 404 inconsistente (fuga de existencia) | ALTA | Regla fundacional 403(rol)→404(alcance); orden 401→403 | FR-017/018 · T043/T051 |
| **E**levation | Cambio de rol no se propaga | MEDIA | Relectura de rol en refresh (≤15 min); inmediato → BL-022 | FR-004 · T049 |

## Hallazgos nuevos del STRIDE → backlog

- **BL-008** (S-006 · binding de refresh a dispositivo/origen) — mitigación adicional de spoofing; stretch.
- **BL-009** (throttle por IP además del lockout por cuenta) — refuerzo anti-DoS; stretch.
- **BL-010** (invalidación inmediata del access en logout — denylist/session-version) — reduce ventana
  de token robado; stretch (ya anotado en FR-003).

## Conclusión

Las amenazas **BLOQUEANTE y ALTA** de STRIDE quedan cubiertas por FRs de esta spec con `Txxx` asociado
(columna Severidad + FR/test); T065 verifica el **100%** de esas amenazas mapeadas a test. Las mitigaciones
adicionales (binding de refresh, throttle por IP, invalidación inmediata en logout voluntario, invalidación
inmediata de rol) son **stretch** → backlog (BL-008/009/010/022). Este STRIDE alimenta los **tests de
seguridad negativos** del gate G3.
