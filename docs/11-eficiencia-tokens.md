# 11 · Eficiencia de tokens y de desarrollo (fase de implementación)

> Cómo ahorrar tokens y facilitar el trabajo de Claude **sin perder el objetivo** (calidad y disciplina
> SDD). Regla de oro: **lo determinista lo hacen las herramientas; Claude razona, no hace de linter.**

## 1. Deterministic-first: las herramientas verifican, Claude corrige

El trabajo mecánico de verificación NO lo hace Claude leyendo código: lo hacen herramientas
deterministas y baratas. Claude consume **solo el resultado** (exit code / lista de errores) y entra a
**corregir** lo que falló.

- **Cheap-first gate ordering (G3):** primero corren, en este orden, y **fallan rápido**:
  1. `tsc --noEmit` (tipos) → 2. `eslint` (Principio XII) → 3. `vitest` (tests) → 4. `promptfoo` (evals).
  Solo si todo lo determinista pasa, se lanza el **panel adversarial** (caro, LLM). No se gasta revisión
  LLM en código que ni compila.
- **Hooks de Claude Code (`PostToolUse`)**: tras cada edición de código, un hook ejecuta
  `tsc`/`eslint`/tests y **devuelve solo los fallos**; Claude los arregla. (Se cablea cuando exista
  `package.json`.)

## 2. Model tiering (el tier más barato que resuelve bien)

No usar modelos *antiguos* (peor resultado); usar el **tier adecuado por tarea** (`model:` por subagente):

| Tarea | Modelo |
|---|---|
| Boilerplate, scaffolding, aplicar fixes mecánicos, formateo | **Haiku** |
| Revisión estándar, consistencia, generación de tests, implementación normal | **Sonnet** |
| Diseño difícil, adversarial profundo, remediación compleja, dilemas de arquitectura | **Opus** |

- El **juez LLM de promptfoo** puede usar un modelo barato (Haiku) para las evals.
- Los agentes del panel ya usan `sonnet` (razonan); los subagentes de implementación mecánica → `haiku`.

## 3. RTK (ya activo)

**RTK (Rust Token Killer)** está instalado a nivel usuario (`~/.claude/CLAUDE.md`): proxy que optimiza
operaciones de CLI (git, etc.) con 60–90% de ahorro, vía hook transparente. No requiere acción.

## 4. Otras palancas

- **Lecturas acotadas:** los agentes leen solo los ficheros relevantes (usar Explore / rutas concretas),
  no el repo entero.
- **Prompt caching:** reутilizar contexto estable (constitution, contrato) entre llamadas.
- **Salidas concisas:** `--output-format json` + extraer solo lo necesario (ya se hace en `gate.sh`).
- **Fail-fast:** cortar en la primera comprobación barata que falle antes de escalar a lo caro.

## Qué se cablea al empezar a implementar

- `package.json` con scripts `lint`, `test`, `typecheck` (CI ya los invoca condicionalmente).
- Hook `PostToolUse` para tsc/eslint/test → Claude solo ve fallos.
- `model: haiku` en los subagentes de implementación mecánica; reservar Opus para lo difícil.
- Reordenar `scripts/gate.sh` G3 para correr lo determinista antes del panel LLM.

> Estas medidas reducen coste y aceleran, **sin relajar** ningún principio: los gates y las evals siguen
> siendo obligatorios; solo cambia **quién** hace cada comprobación (herramienta vs LLM) y **con qué**
> modelo.
