# ADR-0004 · Gobernanza de ramas y enmiendas a la constitution

**Estado:** Aceptado · **Fecha:** 2026-07-11 · **Decisores:** usuario + Claude
**Relacionado:** Constitution v1.7.0 (Principio XV), docs/05 (automatización SDD), docs/06 (roadmap)

## Contexto

Durante la fundación y la feature 001, **todo** (constitution, docs, agentes, plantillas, extensiones, CI
y la propia feature 001: spec/plan/tasks/setup) se ha commiteado sobre la **rama `001-fundacion-auth-rbac`**;
`main` quedó en su estado inicial. Es una **deuda de higiene de ramas**: artefactos **transversales** (que
gobiernan todas las specs) están mezclados con una **rama de feature**.

Dos problemas de gobernanza detectados por el usuario:
1. La constitution/roadmap/fundación **no deben vivir en una rama de feature** (son transversales).
2. Una **enmienda a la constitution** es de gran calado; una vez iniciadas las specs debe hacerse en una
   **tarea/rama aparte**, no mezclada con el trabajo de una spec.

Extraer "limpio" la constitution de la rama 001 exigiría **reescribir ~30 commits de historia** (riesgo
alto a mitad de flujo).

## Decisión

**Opción A — adoptar la regla ya y consolidar después** (bajo riesgo, sin reescribir historia de 001):

1. **Regla de gobernanza (a codificar en la constitution):** tras iniciar las specs, las **enmiendas a la
   constitution** y los cambios de **fundación/roadmap** se hacen en una **rama/tarea dedicada**
   (p. ej. `chore/foundation-governance`), se mergean a `main`, y **nunca** se mezclan con una rama de feature.
2. **Cero ediciones de constitution en ramas de feature** de aquí en adelante.
3. **Consolidación diferida** (tarea propia, cuando se aparque el diseño de 001): llevar la **fundación**
   (constitution, docs, agentes, plantillas, extensiones, CI) a **`main`**, y **re-basar `001`** desde `main`
   con **solo** los artefactos de la feature.
4. **001 queda grandfathered** (Principio XV): no se re-parte; se implementará por user story.

Descartadas: (B) reorganizar git ahora (reescritura de historia, riesgo/esfuerzo altos a mitad de flujo);
(C) no mover nada (no corrige la mezcla ni establece disciplina).

## Consecuencias

**Positivas:** disciplina clara (transversal vs feature); las enmiendas quedan aisladas y auditables; se evita
reescritura arriesgada ahora; la deuda queda **explícita y planificada** (no silenciosa).
**Negativas / deuda aceptada:** hasta la consolidación, `main` no refleja la fundación y la rama 001 sigue
conteniendo artefactos transversales (incl. la enmienda v1.7.0 ya commiteada en 001). Se salda en la tarea
de consolidación.

## Seguimiento

- Backlog: **BL-034** — consolidación fundación→`main` + re-base de `001` como feature pura.
- La regla (1) se añade a la sección **Governance** de la constitution (en esta misma rama de gobernanza).
