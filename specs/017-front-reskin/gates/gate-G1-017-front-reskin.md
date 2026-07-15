# Gate G1 — 017-front-reskin · **PASS**

**Fecha:** 2026-07-15 · **Artefactos:** `spec.md` (+ clarifications) · **Panel:** revisor-cinico,
auditor-spec-theater, revisor-rbac-seguridad · **Rondas:** 3 · **Bloqueantes abiertos:** 0

## Resultado

| Agente | Veredicto final | Huecos abiertos |
|--------|-----------------|-----------------|
| revisor-cinico | APROBADA_CON_COMENTARIOS | 0 |
| auditor-spec-theater | APROBADA_CON_COMENTARIOS | 0 |
| revisor-rbac-seguridad | APROBADA_CON_COMENTARIOS | 0 |

## Recorrido

- **Ronda 1:** 2 BLOQUEANTES (T-001 pares de contraste sin enumerar; H-001 contradicción de alcance),
  7 ALTA, 8 MEDIA → remediados en el spec.
- **Ronda 2:** originales cerrados; la remediación introdujo 2 ALTA en el mecanismo de tema (H-013 modo
  «sistema»; H-016 doble flash) → remediados con **modelo CSS-first + fuente de verdad única**.
- **Ronda 3 (acotada):** alineado el residuo textual del edge case «cambio en caliente». **Convergencia.**

## Cambios estructurales clave introducidos por el gate

1. **Lista cerrada de 17 pares de contraste** (fg/bg, umbral por par, ambos temas) → test determinista iterable.
2. **Framing de alcance preciso**: no amplía alcance funcional del brief; el conmutador de tema es la única
   capacidad interactiva nueva y se testea como tal.
3. **Modelo de tema CSS-first** (`@media` + `:root[data-theme]`), «sistema» sin `data-theme`, script inline
   anti-FOUC con **fuente de verdad única** (el store de React lee el `data-theme` ya aplicado).
4. **Pureza de componentes** (FR-014) y **regresión RBAC del reskin** (FR-015/SC-010) con mecanismo
   determinista de "no se altera ninguna aserción".
5. Descartado explícito del **control segmentado** (no hay filtro cliente real).

Detalle máquina-legible en `gate-G1-017-front-reskin.json`.
