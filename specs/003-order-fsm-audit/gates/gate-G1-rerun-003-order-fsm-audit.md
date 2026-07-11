# Gate G1 (re-entrada tras remediación de G2) — 003-order-fsm-audit (002b)

**Fecha**: 2026-07-11 · **Disparado por**: `after_clarify` (hook mandatorio) tras reformular la spec vía
`/speckit-clarify` para cerrar los hallazgos de G2. **Panel**: revisor-cinico + auditor-spec-theater +
revisor-rbac-seguridad. **Criterio**: 0 BLOQUEANTES.

## Pasada 1 (sobre la spec ya reformulada a mano de G2) → BLOQUEADA

3 BLOQUEANTES convergentes:

- **G1:S-001** (rbac) — la clasificación 404/409/422 era un **oráculo de enumeración** para actores no
  autorizados. → Nuevo **FR-009** (contrato de no-enumeración: colapso a 404, body uniforme).
- **G1:T-001** (spec-theater) — **SC-002** "solape real / falla si se serializa" era **infalsable**. → SC-002
  reescrito a la propiedad real de concurrencia optimista (exactamente uno gana, con o sin solape).
- **G1:H-001** (cínico) — **`draft→assigned` sin dueño** (órdenes atascadas). → Edge Cases/Scope: `draft` es
  estado semilla sin transición saliente en el alcance; creación fuera del proyecto.

ALTAS cerradas: Acceptance Scenario 6 (GUARD_UNMET), SC-006 (no-fuga de `reason` medible), SC-005 determinista
secuencial, asimetría HTTP (FR-009). MEDIAS: colisión de IDs (prefijos G1:/G2:), citar `Order.assignedTo` de
002a, `ACTOR_INVALID` para fallo FK, BL-055 (PII correctiva/mantenimiento trigger), BL-056 (defensa en profundidad).

## Pasada 2 (re-run sobre la spec remediada) → APROBADA (0 BLOQUEANTES)

- **spec-theater**: APROBADA_CON_COMENTARIOS, 0 huecos (T-001 cerrado; SC-002/005/006 falsables).
- **cínico**: REQUIERE_CAMBIOS, 0 bloqueantes — ALTA H-001 (GUARD_UNMET HTTP para actor autorizado), ALTA
  H-002 (higiene de IDs incompleta), MEDIA H-003 (SC-004 sin asertar ACTOR_INVALID).
- **rbac**: REQUIERE_CAMBIOS, 0 bloqueantes — ALTA S-001 (oráculo por el body), ALTA S-002 (actor_id
  server-side), MEDIA S-003/S-004/S-005/S-006.

### Cierres aplicados tras la pasada 2 (todas las ALTAS)

- **FR-009** ampliado: (a) no autorizado → 404 con **body/mensaje uniforme** (sin `code` interno); (b)
  autorizado → 409/422 y **`GUARD_UNMET`→403**; aplica **tras** el 401 de auth (no confunde 401/404).
- **`actor_id`**: contrato duro **server-side** (nunca de input del cliente), exigible ya; tipado → BL-056.
- **SC-004**: aserta `ACTOR_INVALID` + no fuga del error crudo de BD.
- **Higiene de IDs**: prefijos G1:/G2: consistentes; eliminados IDs huérfanos (H-012/13/14); resuelta la
  doble acepción de `G2:H-003`.
- Diferidos: side-channel de tiempo (S-004), test guard-ausente en consumidoras (S-005), health-check del
  trigger (S-006) → BL-055/056.

**Veredicto final G1**: **APROBADA** (0 BLOQUEANTES; ALTAS cerradas en spec; MEDIAS de defensa en profundidad
en backlog con rationale XV). Listo para `/speckit-plan` (regenerar research + data-model) → `/speckit-tasks`
→ `/speckit-analyze` → **G2**.
