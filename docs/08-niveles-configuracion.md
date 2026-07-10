# 08 · Niveles de configuración (proyecto / usuario / organización)

> Dónde debe vivir cada artefacto y por qué. Regla general: **lo específico del producto → proyecto;
> lo reutilizable entre proyectos → usuario u organización.** Para el entregable, todo vive en el repo
> (self-contained), y lo genérico se diseña para poder **promoverse** más arriba.

## Los niveles

| Nivel | Alcance | Ubicación |
|---|---|---|
| **Constitution** | Reglas no negociables de *este* producto | `.specify/memory/constitution.md` (en el repo) |
| **Proyecto** | Todo lo específico del entregable, compartido con quien clone | repo (`.claude/`, `.specify/`, `.github/`, config raíz, `docs/`) |
| **Usuario** | Preferencias y herramientas personales, para *todos* tus proyectos | `~/.claude/` (settings, CLAUDE.md, agents, skills globales) |
| **Local** | Overrides personales de *este* proyecto, no compartidos | `.claude/settings.local.json` (gitignored) |
| **Organización** | Convenciones compartidas por varios equipos/proyectos | repo/plantilla de org, managed settings, MCP compartido |

## Mapa de artefactos de este proyecto

| Artefacto | Nivel recomendado | Por qué |
|---|---|---|
| `constitution.md` (principios FieldOps) | **Constitution/Proyecto** | Reglas de este producto. |
| Plantillas Spec Kit (spec/plan/tasks/checklist) | **Proyecto** | Imponen la calidad de *estas* specs; las skills las leen del repo. |
| Extensión git de Spec Kit | **Proyecto** | Rama por spec de *este* repo. |
| Extensión `speckit-gate` + `scripts/gate.sh` | **Proyecto** | Cablea los gates de *este* flujo. |
| CI (GitHub Actions), CODEOWNERS, PR template, README raíz | **Proyecto** | Gobiernan *este* repositorio. |
| Config de lint/format (ESLint/Prettier/tsconfig) | **Proyecto** | Codifica el Principio XII para *este* código. |
| `docs/glossary.md` (lenguaje ubicuo) | **Proyecto** | Términos del dominio de *este* producto. |
| Roadmap, bitácora, informes de gate | **Proyecto** | Historia y planificación de *este* proyecto. |
| **Agentes adversariales** (cinico, spec-theater, rbac, consistencia, implementacion) | **Proyecto ahora → Usuario/Org después** | Son genéricos (SDD, no FieldOps). En el repo para el entregable; candidatos a `~/.claude/agents` o a una plantilla de organización para reutilizarlos. |
| **MCP `eval-objetivos`** | **Proyecto ahora → Usuario/Org después** | Función única y reutilizable (SC→métricas). Escalable a `~/.claude` o a un MCP de organización. |
| `.claude/settings.json` (allowlist del gate) | **Proyecto** (commiteado) | Reduce prompts al equipo; si fuera solo personal → `settings.local.json`. |
| Claves/API del proveedor de IA | **Usuario/Local** | Secretos; nunca en el repo (`.env` gitignored, `.env.example` sí). |

## Criterio para "escalar arriba"

Un agente o MCP sube de nivel (proyecto → usuario → organización) cuando:
1. Su función es **genérica** (no depende del dominio FieldOps).
2. Tiene una **responsabilidad concreta y única** (buena práctica de diseño de agentes/MCP).
3. Se prevé **reutilizarlo** en otros proyectos.

Los 3 (+2) agentes del panel y el MCP `eval-objetivos` cumplen los tres criterios → se mantienen en el
repo para el entregable, pero **documentados como promovibles** a `~/.claude` o a la organización.
