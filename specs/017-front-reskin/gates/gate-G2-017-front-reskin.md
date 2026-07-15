# Gate G2 — 017-front-reskin · **PASS**

**Fecha:** 2026-07-15 · **Artefactos:** `spec.md` + `plan.md` + `tasks.md` (+ quickstart) · **Panel
(acumulativo):** revisor-cinico, auditor-spec-theater, revisor-rbac-seguridad, **revisor-consistencia** ·
**Rondas:** 2 · **Bloqueantes abiertos:** 0

## Resultado

| Agente | Veredicto final | Huecos abiertos |
|--------|-----------------|-----------------|
| revisor-consistencia | APROBADA_CON_COMENTARIOS | 0 |
| revisor-cinico | APROBADA_CON_COMENTARIOS | 0 |
| auditor-spec-theater | APROBADA_CON_COMENTARIOS | 0 |
| revisor-rbac-seguridad | APROBADA_CON_COMENTARIOS | 0 |

## Recorrido

- **Ronda 1:** 0 BLOQUEANTES pero 4 ALTA + 5 MEDIA. ALTA: H-001 (T004 acoplaba contraste claro+oscuro →
  US1 no cerraba verde solo), H-002/K-001 (`fe3-contrast.test.ts` comprometido en spec/plan sin tarea + par
  `--color-danger`-texto sin cobertura en oscuro), T-001 (T029 responsive ambiguo + FR-009 sin SC), T-002
  (T027 sin script committeado). Remediado en cascada spec→plan→tasks.
- **Ronda 2 (verificación):** ALTA cerradas. Residuos MEDIA nuevos (trazabilidad FR-005, etiqueta [Red] en
  T004b, anti-drift script inline↔theme.ts, cita SC-003 obsoleta en T005) → corregidos. **Convergencia.**

## Cambios clave introducidos por G2

1. **Contraste desacoplado por tema**: T004 (claro, cierra en US1) + T013b (oscuro, cierra en US2) →
   checkpoint de US1 verde e independiente (MVP real).
2. **`fe3-contrast.test.ts` reconciliado** (T004b claro, T013b oscuro) para no romper un test existente al
   re-tematizar (SC-004); par `--color-danger`-texto añadido a la lista cerrada (18 pares).
3. **SC formalizados**: SC-003 → SC-003a (contraste) + SC-003b (axe); **SC-011** nuevo para FR-009
   (responsive) con test e2e Playwright concreto.
4. **Guardianes deterministas**: T027 script committeado `check-rbac-test-diff.sh` (SC-004); T028 test que
   parsea `tokens.css` (reduced-motion); T026 regresión RBAC por **rol×estado**.
5. **theme.ts CSS-first** explícito (sin `matchMedia`/tema resuelto) + **anti-drift** del script inline.

Detalle de rondas en los mensajes del panel; JSON de G1 en `gate-G1-017-front-reskin.json`.
