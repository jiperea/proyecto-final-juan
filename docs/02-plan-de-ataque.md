# 02 · Plan de ataque

> Cómo vamos a trabajar el proyecto final. Dos ideas rectoras: **EARS** para eliminar ambigüedad en
> los requisitos, y un **agente escéptico** que reta lo que damos por sentado antes de cada gate.

## Orden de fases (Spec Kit, nombres reales de las skills)

1. `/speckit-constitution` — principios no negociables + alcance (ver reparto, bloque A).
2. `/speckit-specify` — FRs en **EARS**, NFRs cuantificados, edge cases, criterios de aceptación.
3. `/speckit-clarify` — resolver ambigüedades (alimentado por el informe del revisor cínico).
4. `/speckit-checklist` — verificación de que la spec está lista para planificar.
5. `/speckit-plan` — plan técnico con dependencias y paralelismo.
6. `/speckit-tasks` — descomposición en tareas.
7. `/speckit-analyze` — consistencia entre artefactos antes de implementar.
8. `/speckit-implement` — frontend + backend + tests juntos.

Cada fase es un **gate**: solo se avanza con luz verde explícita, y con **commits separados** que
demuestran que la spec fue antes que el código.

## Dónde vive cada cosa

- **Planificación previa (este `docs/`):** brief, reparto, plan. NO son artefactos oficiales.
- **Artefactos oficiales de Spec Kit:** en `.specify/` (o `/specs`), generados por las skills `speckit-*`.
- **Contrato de API:** `/contracts` (OpenAPI). **Trazabilidad:** `/docs/traceability.md`.
- **Componente IA:** contrato + eval con golden cases en `/evals`.

## El agente escéptico (`revisor-cinico`)

- **Cuándo se invoca:** antes de cada gate importante. Primero sobre `01-reparto-constitution-vs-spec.md`
  (retar el resumen inicial y sus asunciones `AS-xx`); después sobre la spec ya redactada.
- **Qué produce:** informe JSON de `huecos[]` con pregunta crítica y severidad + veredicto.
- **Qué hacemos con él:** sus preguntas críticas alimentan `/speckit-clarify` y ajustan la constitution
  o la spec. Ningún hueco BLOQUEANTE sin resolver pasa el gate.

## Principio EARS

Todo FR se redacta como: *WHEN [condición/disparador] THE [sistema] SHALL [acción] [resultado
medible/observable]*. Si un FR admite más de una implementación válida, no está listo: es ambigüedad,
no especificación.

## Estado actual

- [x] Carpeta `docs/` con brief, reparto y plan.
- [x] Agente `revisor-cinico` creado en `.claude/agents/`.
- [ ] Ejecutar `revisor-cinico` sobre el reparto → informe de huecos.
- [ ] `/speckit-constitution` (tras resolver hallazgos).
- [ ] `/speckit-specify` … (resto del flujo).
