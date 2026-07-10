# [CHECKLIST TYPE] Checklist: [FEATURE NAME]

**Purpose**: verificar la CALIDAD de los requisitos (no la implementación) — "unit tests for English".
**Created**: [DATE] · **Feature**: [###-feature-name]

**Note**: generado por `/speckit-checklist`. Sustituye los ejemplos por ítems reales de la feature.

<!--
  Cada ítem es una PREGUNTA sobre el requisito, con marcador de trazabilidad y referencia a la spec.
  Marcadores: [Gap] [Ambiguity] [Conflict] [Assumption]. Referencia: [Spec §X] o [FR-0xx].
  Objetivo: ≥ 80% de ítems con referencia de trazabilidad.
-->

## Completeness (¿está todo?)

- [ ] CHK001 — ¿Cada funcionalidad del alcance tiene ≥1 FR? [Gap] [Spec §Requirements]
- [ ] CHK002 — ¿Están cubiertos los edge cases (concurrencia, estados inválidos, fallos externos)? [Gap]
- [ ] CHK003 — ¿Hay FR de guarda para cada acción no permitida (RBAC)? [Gap] [FR-00x]

## Clarity (¿sin ambigüedad? — EARS)

- [ ] CHK010 — ¿Cada FR está en formato EARS y pasa el test de la pregunta cero? [Ambiguity] [FR-00x]
- [ ] CHK011 — ¿Cero términos sin cuantificar ("rápido", "seguro", "suficiente")? [Ambiguity]

## Consistency (¿sin contradicciones?)

- [ ] CHK020 — ¿Ningún par de FR/NFR se contradice? [Conflict]
- [ ] CHK021 — ¿La terminología coincide con `docs/09-glossary.md`? [Ambiguity]

## Measurability (¿verificable?)

- [ ] CHK030 — ¿Cada FR mapea a ≥1 test nombrable (trazabilidad)? [Gap] [Spec §Trazabilidad]
- [ ] CHK031 — ¿Cada SC es medible y tiene su eval (promptfoo)? [Gap] [Spec §Eval]
- [ ] CHK032 — ¿Los NFR tienen número + unidad (+ percentil)? [Ambiguity]

## Coverage (contrato + seguridad)

- [ ] CHK040 — ¿Cada endpoint del contrato tiene contract test por código de respuesta? [Gap]
- [ ] CHK041 — ¿Cada acción valida rol + pertenencia + estado de origen? [Gap] [FR-00x]
- [ ] CHK042 — ¿PII: cifrado, URLs firmadas ≤300 s, no en logs, minimización a la IA? [Assumption]

## Assumptions (¿declaradas?)

- [ ] CHK050 — ¿Las asunciones están declaradas explícitamente y son razonables? [Assumption]

## Notes

<!-- Anota huecos detectados y su resolución (o el gate G1 que los cazará). -->
