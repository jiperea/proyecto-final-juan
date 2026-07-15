# Gate G2 — 019-seed-approvable-review · PASS

**Fecha:** 2026-07-15 · **Panel (acumulativo):** G1 + revisor-consistencia · **Bloqueantes:** 0

Feature fixture: `spec.md` es el único artefacto (sin plan/tasks separados, por proporcionalidad XV);
G2 = consistencia **spec ↔ implementación ↔ tests**.

| Agente | Veredicto | Huecos abiertos |
|--------|-----------|-----------------|
| revisor-consistencia | REQUIERE_CAMBIOS → remediado | 0 |

## Hallazgos y remediación
- **K-001 (ALTA):** faltaba test del approve real sobre la ancla → añadido al test (supervisor aprueba
  `approvableReview` → 200 closed).
- **K-002 (ALTA):** FR-001 "exactamente 1" vs test `≥1` → test refuerza `===1` evidencia/notas + campos del audit.
- **K-003 (MEDIA):** guard de re-seed sin test → `ensureSeedableOrThrow` exportado + test (`rejects RESEED_HINT`).
- **K-004 (MEDIA):** FRs citaban etiquetas no definidas (H-004/H-005/S-001/T-004) → retiradas del spec.

Cobertura FR→(código|test) completa; sin deriva; alineado con la constitución (solo `backend/prisma/`).
