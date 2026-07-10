# ADR-0001: Arquitectura hexagonal, stack TS/Node y verificación adversarial independiente

- **Estado**: Aceptado
- **Fecha**: 2026-07-10
- **Decisores**: autor del proyecto (rol arquitecto/ingeniero)

## Contexto

El proyecto final de FieldOps pide un slice SDD. El brief **no fija tecnología**. Necesitamos decidir
arquitectura, stack y cómo verificar la calidad de cada fase de forma fiable. El curso ya ha fijado
estándares de facto (contract-first, TDD, Spec Kit) y hemos aprendido el patrón de revisión adversarial
(Módulo 8) y evals (Módulo 8).

## Decisión

1. **Arquitectura hexagonal** (dominio puro / handlers / infra): el dominio no depende de infraestructura
   y se testea sin mocks (DIP + SRP).
2. **Stack TS/Node** (Express, Prisma con SQLite→PostgreSQL, Zod, OpenAPI 3.1, Vitest, pino): el más
   común y mejor integrado con Claude y Spec Kit.
3. **Verificación adversarial INDEPENDIENTE** como gates acumulativos (G1/G2/G3): agentes especializados
   que hacen de segunda mirada neutral sobre lo que produce el autor y Spec Kit (el que propone no valida).
4. **Evals con promptfoo** (no motor propio): framework maduro, TS/Node, CI-first.

## Alternativas consideradas

- **Arquitectura por capas + módulos por dominio** (FieldOps grande) — válida, pero más ceremonia para
  un slice; hexagonal expresa mejor SOLID con dominio testeable sin mocks.
- **Stack Python / otro** — peor encaje con nuestro tooling (Claude/Spec Kit) y con el equipo.
- **Motor de eval propio / MCP casero** — reinventar algo maduro; descartado a favor de promptfoo.
- **Confiar solo en /speckit-analyze y /speckit-checklist** — son cooperativos (auto-análisis del autor);
  faltaba la mirada independiente/hostil que aportan los agentes adversariales.

## Consecuencias

- **Positivas**: dominio aislado y testeable; contrato como fuente de verdad; verificación independiente
  que caza errores que el auto-análisis racionaliza; tooling reutilizable.
- **Negativas / coste**: más piezas (agentes, extensiones, gates) que mantener; curva de arranque.
- **Verificación**: grep de arquitectura (domain sin infra), contract tests 100%, gates con 0 bloqueantes,
  evals en umbral.
