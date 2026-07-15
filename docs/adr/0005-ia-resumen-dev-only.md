# ADR-0005 · Resumen IA (Func #5) operable solo en dev; indisponibilidad honesta en el entorno desplegado

**Estado:** Aceptado · **Fecha:** 2026-07-15 · **Decisores:** usuario + Claude
**Relacionado:** Constitution (Principio VIII IA; regla dura "sin API de pago"), feature 018
(`018-ai-summary-dev-only`), BL-072 (docs/06-roadmap.md)

## Contexto

El resumen IA de la incidencia (Brief Func #5, features 006/007) invoca el CLI `claude` (`AI_PROVIDER=claude-cli`)
en desarrollo y un proveedor `mock` en tests. La regla dura de la constitución es **"sin API de pago"**. La
imagen del backend desplegada (contenedor/Render) **no incluye el binario `claude`**, así que el resumen IA
**no puede operar en el entorno desplegado**: verificado en vivo, devolvía `503 SERVICE_UNAVAILABLE` con un
mensaje "Reinténtalo" **engañoso** (reintentar nunca funcionará ahí). Es la deuda trazada **BL-072**.

## Decisión

El resumen IA es **dev-only** y el producto lo comunica con **honestidad**, **sin** añadir API de pago:

1. **Proveedor no operable ⇒ `AI_UNAVAILABLE` (HTTP 501)**, distinguible del `503` transitorio y **no
   reintentable**. La clasificación se hace en el **adaptador** (error nativo de `execFile`: ENOENT/EACCES/
   EPERM/ENOEXEC/ENOTDIR → no operable; post-spawn → transitorio); el dominio permanece puro.
2. **Guard dev-only deny-by-default**: `claude-cli` se considera operable **solo** en `development`; en
   pre/prod se trata como no operable (config validada e inyectada; sin I/O de red). **Fail-fast**:
   `AI_PROVIDER=mock` con `NODE_ENV=production` **aborta el arranque** (el mock daría resúmenes falsos).
3. **UI honesta**: ante `AI_UNAVAILABLE`, muestra «El resumen por IA no está disponible en este entorno»,
   **deshabilita** el disparador y **no** ofrece reintento.
4. **Sin API de pago**: `AI_PROVIDER` permanece `claude-cli` (dev) | `mock` (tests). No se introduce proveedor
   remoto ni clave.

## Consecuencias

- **BL-072 se cierra como decisión dev-only** (no como "proveedor de producción por API"). Reabrir la IA en
  el entorno desplegado exigiría **enmendar** la regla "sin API de pago" (nueva decisión de gobernanza) +
  cubrir PII/DPA/TLS y re-ejecutar el eval específico del proveedor (H-005 de 007).
- El eval de IA (`/evals`) sigue siendo **dev-only**; en el entorno desplegado la capacidad se declara no
  disponible, sin fingir un resultado.
- Trazabilidad: `docs/06-roadmap.md` (BL-072), `docs/design-system.md §8` (mensaje de error), `docs/traceability.md` (018).
