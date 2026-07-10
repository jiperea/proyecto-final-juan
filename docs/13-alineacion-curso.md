# 13 · Alineación con lo aprendido en el curso

> Autoevaluación honesta: ¿el proyecto aplica lo aprendido en el curso SDD? Mapeo por tema →
> cómo se aplica aquí → estado. Incluye lo diferido/no aplicable (no solo lo que encaja).

## Núcleo SDD / Spec Kit

| Tema | Cómo se aplica | Estado |
|---|---|---|
| Flujo completo (constitution→specify→clarify→checklist→plan→tasks→analyze→implement) | Se ejecuta con las **skills reales** de Spec Kit; una rama por spec | ✅ |
| Constitution como ley del proyecto | `.specify/memory/constitution.md` (14 principios verificables + convenciones) | ✅ |
| EARS + NFRs cuantificados + "pregunta cero" | spec 001 (FRs EARS, SC con P95) | ✅ |
| Anti spec-theater | agente `auditor-spec-theater` (test objetivo) | ✅ |
| Contract-first (OpenAPI) | Principio II + sección de contrato + `/v1` | ✅ |
| Trazabilidad requisito→test | matriz en la spec + `docs/traceability.md` (Principio VI) | ✅ |

## Herramientas del agente (módulos previos)

| Tema | Cómo se aplica | Estado |
|---|---|---|
| **Skills** | skills propias (`informe-tokens`) + skills speckit | ✅ |
| **Hooks** | hook `SessionEnd` (analítica), hooks de extensión (git, gate), RTK PreToolUse | ✅ |
| **MCP** | build-vs-buy razonado (promptfoo); contrato MCP de dominio diferido a 006 | ⏳ parcial |
| **Subagentes / multi-agente** | panel adversarial + remediador + auditor-brief; delegación con gates | ✅ (más allá) |
| **Context engineering** | `CLAUDE.md` operativo, docs estructurados, bitácora de decisiones | ✅ |
| **Observabilidad** | correlation-id + logging (constitution X); analítica de tokens RTK/ccusage | ✅ |
| **Headless** | `scripts/gate.sh` (`claude -p`), CI sin API | ✅ |

## M7–M11

| Tema | Cómo se aplica | Estado |
|---|---|---|
| M7 · separación proponer/validar | el que propone (autor/remediador) ≠ el que valida (panel) | ✅ |
| M8 · evals | promptfoo (faithfulness/umbral), local sin API | ✅ |
| M8 · adversarial review | panel encadenado G1/G2/G3 + convergencia 0 bloqueantes | ✅ (más allá) |
| M9 · constitution como política + verificador | constitution + gates; verificador independiente (panel/analyze) | ✅ / ⚠️ script CI determinista → backlog |
| M10 · constitution verificable, ADRs, STRIDE, rollback, multi-agente | todo aplicado (ADR 0-3, STRIDE 001, migraciones reversibles) | ✅ |
| M10 · `validate-constitution.sh` (gate CI determinista) | no hecho; sustituido por gate adversarial | ⚠️ backlog/DevOps |
| M11 · contract-first, ciclo SDD autónomo | aplicado | ✅ |
| M11 · MCP como producto (contrato) | diferido a la feature 006 | ⏳ |
| M11 · prompt-pack per-spec | cubierto por `CLAUDE.md` (no artefacto separado) | ~ |

## No aplicable

- **M6 · modernización de legacy / characterization tests** — el proyecto es *greenfield*, no legacy.
- **M10 · auditoría regulatoria** — el slice no es entorno regulado.

## La lección de fondo (meta)

Más allá de los artefactos, se aplica el **mindset** del curso: **poner en duda lo dado por sentado** —
hasta el punto de auditar adversarialmente nuestra propia constitution y de corregir un sesgo en nuestro
propio agente auditor—, **converger en 0 bloqueantes** (no 0 hallazgos), **proporcionalidad/YAGNI**,
**decisiones trazables** (bitácora + ADRs) y **fuentes de verdad claras** (brief→constitution→spec).

## Veredicto

**Sí, se aplica lo aprendido** — en artefactos y en mentalidad, y en varios puntos se va más allá. Los
huecos (`validate-constitution.sh`, contrato MCP, prompt-pack per-spec) son **diferencias conscientes**
ubicadas en backlog o en la feature correspondiente, no olvidos.
