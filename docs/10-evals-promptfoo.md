# 10 · Evals con promptfoo (decisión build-vs-buy)

> **Decisión:** no construimos un motor de eval propio; adoptamos **promptfoo** (framework maduro,
> testeado, usado por OpenAI y Anthropic). Cubre el eval del componente IA y las aserciones de Success
> Criteria, con integración CI de primera clase. Ver comparativa y fuentes al final.

## Por qué promptfoo (y no DeepEval/Ragas)

| Criterio | promptfoo | DeepEval | Ragas |
|---|---|---|---|
| Stack | **TS/Node nativo** (CLI + lib, YAML) | Python (pytest) | Python |
| CI / GitHub Actions | **Sí, first-class** (falla el build por umbral) | Sí (pytest) | Dashboards, menos gate |
| LLM-as-judge + aserciones deterministas | **Sí** | Sí | Métricas RAG |
| Faithfulness / alucinación | Sí (assert + judge) | Sí (14+ métricas) | **Métricas RAG académicas** |
| Encaje con nuestro caso | **El mejor** (TS/Node + CI + aserciones SC) | Bueno si fuéramos Python | Estrecho (solo RAG) |

Nuestro backend es TS/Node y queremos un **gate de CI**; promptfoo es el encaje natural. DeepEval sería
la opción si el proyecto fuera Python; Ragas es demasiado específico de RAG.

## Qué evaluamos con promptfoo

1. **Componente IA (feature 005)** — el asistente de resumen:
   - `faithfulness` ≥ 0.90 (LLM-as-judge sobre la evidencia).
   - `tasa_alucinacion` ≤ 0.05.
   - **no-fuga de PII**: aserción que falla si la salida contiene nombre/dirección/matrícula del golden case.
   - **fallback**: golden cases con evidencia insuficiente → la salida DEBE declararlo y no resumir.
2. **Success Criteria por spec (Principio XIV)** — cada SC medible se codifica como uno o más test
   cases con aserciones (deterministas o judge); el % de SC que pasan es la métrica del objetivo.

## Estructura en el repo

```
/evals
  promptfooconfig.yaml        # suite principal (providers, prompts, tests, thresholds)
  ia-resumen/                 # golden cases del componente IA (feature 005)
    golden-cases.yaml
  sc/                         # aserciones de Success Criteria por spec
    001-fundacion.yaml
    ...
```

## Integración con el flujo

- **G3 (tras implement):** el gate ejecuta `npx promptfoo eval` además del panel de agentes; si algún
  umbral no se cumple, el gate **falla** (exit ≠ 0), igual que un bloqueante.
- **CI:** un job de GitHub Actions corre la suite en cada PR (usando la action oficial de promptfoo) y
  publica el diff en el PR.
- **Reutilización:** promptfoo es genérico → esta configuración es un patrón reutilizable en otros
  proyectos (nivel usuario/organización, ver `docs/08`).

## Nota sobre el "MCP eval-objetivos"

Se **descarta** construir un MCP de eval propio (habría sido reinventar promptfoo). Si en el futuro se
quisiera exponer la eval como tool MCP para otros clientes, se haría un **adaptador fino** sobre
promptfoo, no un motor nuevo.

## Fuentes

- Promptfoo vs DeepEval vs RAGAS (2026) — https://genai.qa/blog/promptfoo-vs-deepeval-vs-ragas/
- LLM Evaluation Framework Benchmark 2026 — https://aiml.qa/llm-evaluation-framework-benchmark-2026/
- promptfoo (GitHub) — https://github.com/promptfoo/promptfoo
- CI/CD Integration — https://www.promptfoo.dev/docs/integrations/ci-cd/
- GitHub Action — https://github.com/promptfoo/promptfoo-action
- Assertions & Metrics — https://www.promptfoo.dev/docs/configuration/expected-outputs/
