# Gate G1 · 006-revision-supervisor — Resumen

**Veredicto final: ✅ PASS (0 BLOQUEANTES)** · Fecha: 2026-07-13
**Panel**: `revisor-cinico`, `auditor-spec-theater`, `revisor-rbac-seguridad` (acumulativo G1)

Convergencia en **3 pases** (remediación vía re-ejecución de `/speckit-clarify`, no a mano):

| Pase | Veredicto | Bloqueantes | Acción |
|------|-----------|-------------|--------|
| 1 | BLOQUEADA | 2 (B1 motivo-aprobación, B2 lectura) + 4 ALTA + 7 MEDIA + 1 BAJA | Remediación ronda 1 (13 FR; B2 = decisión humana → read-side fuera de 006) |
| 2 | BLOQUEADA | 1 (T-001: FR-013 sin código HTTP) + 1 ALTA + MEDIAs | Remediación ronda 2 (FR-013 → `409 EVIDENCE_MISSING`; #010/BL-070; SoD) |
| 3 | APROBADA_CON_COMENTARIOS | 0 | Limpieza de 2 residuos doc (placeholder M6; numeración roadmap) |

## Cómo se cerró cada hallazgo

- **B1** → FR-008/FR-009: motivo en aprobación validado idéntico al rechazo si `reason` presente.
- **B2** (decisión humana) → lectura de detalle **fuera de 006** (write-only); trazada como **feature #010
  `NNN-order-detalle-read` (BL-070)** en el roadmap, antes de FE-1, con **enmienda Constitution XI** como
  precondición (technician lee su propio motivo de rechazo).
- **A1** → FR-003: `sanitizeReason()` determinista + "vacío tras saneo".
- **A2** → FR-011: `decision` inválida → `422 VALIDATION_ERROR` antes que `INVALID_REASON`.
- **A3** → `attempt` no es de 006 (005/#008).
- **M1** → FR-010: 500 no transitorio vs 503 BD no disponible.
- **M2** → FR-007: 404 (visibilidad state-scoped) justificado vs 003 FR-009 regla (a).
- **M3** → FR-012: actor derivado del JWT server-side.
- **M4** → accesos denegados diferidos a #009.
- **M5/S-006** → asunción de unicidad de rol (aprovisionamiento, sin enforcement); SoD = backlog.
- **M6** → FR-013: guard defensivo `COUNT(OrderEvidence) ≥ 1` → `409 EVIDENCE_MISSING` (suelo de integridad,
  no frescura).
- **M7** → nº de rechazos observable vía `OrderAudit`.
- **M8** → sin interacción con reasignación (004 solo assigned/in_progress).
- **L1** → SC-006 medido por separado approve/reject.

## Seguimiento (no bloqueante, trazado)

- **#010 / BL-070**: backend read-side + enmienda Constitution XI — prerequisito de FE-1/FE-4.
- SoD formal (evitar auto-aprobación con roles superpuestos) — backlog.
- Retro-alinear la definición de `sanitizeReason` en 003/004/005 — deuda documental.

Artefactos: `gate-G1-006-revision-supervisor.json` (hallazgos pase 1), `-propuestas.md` (remediador).
