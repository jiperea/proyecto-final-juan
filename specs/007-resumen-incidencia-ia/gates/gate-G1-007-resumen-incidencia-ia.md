# Gate G1 · 007-resumen-incidencia-ia — Resumen

**Veredicto final: ✅ PASS (0 BLOQUEANTES)** · Fecha: 2026-07-13
**Panel**: `revisor-cinico`, `auditor-spec-theater`, `revisor-rbac-seguridad`

Convergencia en **3 pases** (remediación vía re-ejecución de `/speckit-clarify`; sesión "remediación gate G1"):

| Pase | Bloqueantes | Acción |
|------|-------------|--------|
| 1 | 4 (B1 PII entrada vs VIII, B2 saneo salida sin mecanismo, B3 fallback inalcanzable, B4 timeout sin valor) | Ronda 1 + 3 decisiones humanas (redacción PII, fallback, evento de acceso) |
| 2 | 1 (PII de nombres/direcciones por regex es inviable; FR-004 hereda la debilidad) | Ronda 2 + 1 decisión humana (enfoque por capas para nombres) |
| 3 | **0** (2 ALTA + 2 MEDIA) | Ronda 3: honestidad FR-004(b) (no chequeo de runtime para nombres), FR-013 distingue `blocked_pii`, trazabilidad FR-004 en dos filas, BL-073 |

## Cómo se resolvió el eje central (Constitution VIII, no excepcionable)

- **PII estructurada** (email/teléfono/DNI-NIF/matrícula/`object_ref`): **redacción determinista por patrones** en
  entrada (FR-003b) + detector en salida (FR-004a). Garantía de runtime.
- **Nombres/direcciones** (texto libre, sin regex fiable): **instrucción al proveedor** (FR-003c) +
  **verificación en el eval** con golden cases de literales conocidos (FR-004b, gate G3). Residual best-effort
  **honesto y trazado (BL-073)**, no una garantía de runtime falsa. Coherente con VIII anclado a eval (docs/10).

## Decisiones humanas (clarify + remediación)

1. Fallback "insuficiente" = notas vacías tras saneo **Y** 0 evidencias (corto-circuito) → reformulado a
   **proveedor declara `sufficient=false`** (realista) + corto-circuito degenerado.
2. Minimización PII = allowlist → **allowlist + redacción por patrones (estructurada) + capas para nombres**.
3. Rate-limit **10/60 s** por usuario.
4. **Evento de acceso** sin PII (trazabilidad forense), con `blocked_pii` distinguible.
5. Enfoque por capas para nombres/direcciones (vs NER / no-enviar-notas).

## Estado

- **14 FR, 7 SC**, contrato `summarizeOrderIncident` propuesto. Eval promptfoo (faithfulness ≥ 0.90,
  alucinación ≤ 0.05, no-fuga, fallback). Checklist 16/16.
- Deuda trazada: **BL-072** (proveedor de producción TLS/DPA), **BL-073** (endurecimiento PII texto libre / NER),
  segmentación de ámbito del supervisor (backlog).

Artefacto de hallazgos: `gate-G1-007-resumen-incidencia-ia.json` (pase 1).
