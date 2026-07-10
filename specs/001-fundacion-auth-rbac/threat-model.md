# Threat Model (STRIDE) — 001 Fundación auth/sesión/RBAC

**Fecha:** 2026-07-10 · **Alcance:** autenticación, sesión y RBAC (superficie de seguridad de FieldOps).
Convención: features sensibles de seguridad llevan STRIDE (constitution). Cada amenaza → mitigación →
FR/test; lo no cubierto → backlog.

## Matriz STRIDE

| Categoría | Amenaza | Mitigación | FR / test |
|-----------|---------|------------|-----------|
| **S**poofing (suplantación) | Robo de credenciales; adivinación; suplantar sesión | argon2id; login uniforme; lockout; refresh opaco HttpOnly | FR-001/002/011 |
| **S**poofing | Reutilizar refresh robado | **Rotación single-use** + revocar familia en reuso | FR-004/004b |
| **T**ampering (manipulación) | Alterar el token de acceso | JWT **firmado** (validación de firma) | FR-007 · test token manipulado→401 |
| **T**ampering | CSRF sobre refresh/logout (cookie) | **Protección CSRF** + SameSite=Strict (técnica en /plan) | FR-012 · S-004(backlog) |
| **R**epudiation (repudio) | Negar acciones / accesos | **Auditoría** (transición: actor/ts/motivo); **accesos denegados** (stretch); correlation-id | FR-014 · BL-002 |
| **I**nfo disclosure (fuga) | **Enumeración de usuarios** (login/lockout/404) | 401 uniforme; lockout mismo timing para inexistentes; **404** recurso ajeno | FR-002/009/011 |
| **I**nfo disclosure | PII (email) en logs/errores | Redacción de PII; identifier fuera del pipeline de logs | FR-014 · BL (S-007) |
| **I**nfo disclosure | PII en reposo | Cifrado en reposo (constitution IX) — aplica más a 002+ (datos de cliente) | Constitution IX |
| **D**oS | Fuerza bruta / spam de login | Lockout **ventana fija** (no extensible) + rate-limit | FR-011 |
| **D**oS | **Lockout como DoS** dirigido a un usuario | Ventana fija que **no se extiende** con intentos; (throttle por IP → backlog) | FR-011 · BL |
| **D**oS | Arranque en estado inconsistente | Config **fail-fast** al arrancar | FR-016 |
| **E**levation (escalada) | Saltarse RBAC forzando la API | RBAC **en backend** (rechaza aunque se fuerce); 401/403/404 | FR-007/008/009/010 |
| **E**levation | Usuario **bloqueado** sigue con sesión activa | Verificar **estado de cuenta** en refresh/validación de access | FR-004c |
| **E**levation | 403 vs 404 inconsistente (fuga de existencia) | **Regla fundacional** 403 (rol) vs 404 (alcance) | FR-017 |

## Hallazgos nuevos del STRIDE → backlog

- **BL-008** (S-006 · binding de refresh a dispositivo/origen) — mitigación adicional de spoofing; stretch.
- **BL-009** (throttle por IP además del lockout por cuenta) — refuerzo anti-DoS; stretch.
- **BL-010** (invalidación inmediata del access en logout — denylist/session-version) — reduce ventana
  de token robado; stretch (ya anotado en FR-003).

## Conclusión

Las amenazas **críticas y altas** de STRIDE quedan cubiertas por FRs de esta spec (tras los fixes de G1).
Las mitigaciones adicionales (binding, throttle IP, invalidación inmediata) son **stretch** → backlog.
Este STRIDE alimenta los **tests de seguridad** (negativos) del gate G3.
