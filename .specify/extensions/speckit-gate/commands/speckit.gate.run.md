---
description: Ejecuta el gate adversarial acumulativo de la fase actual (G1/G2/G3), consolida hallazgos y, si hay bloqueantes, propone remediación.
---

# speckit.gate.run — Gate adversarial acumulativo

Ejecuta el punto de control de calidad de la fase actual del flujo Spec Kit. Los agentes son
**especializados y encadenados de forma acumulativa**: cada gate re-ejecuta los de las fases anteriores
(regresión) y añade el suyo. Criterio de avance: **0 hallazgos BLOQUEANTES** (Constitution, Principio
XIII).

## 1. Determinar la fase y el conjunto de agentes

Detecta la fase por el hook que disparó el comando (o por el argumento `$ARGUMENTS`):

| Fase | Hook | Artefactos a revisar | Conjunto ACUMULATIVO de agentes |
|------|------|----------------------|---------------------------------|
| **G1** | `after_clarify` | `spec.md` (+ clarifications) | `revisor-cinico`, `auditor-spec-theater`, `revisor-rbac-seguridad` |
| **G2** | `after_analyze` | `spec.md`, `plan.md`, `tasks.md` | G1 + `revisor-consistencia` |
| **G3** | `after_implement` | diff + `spec.md` + contrato + tests | G1 + G2 + `revisor-implementacion` + `promptfoo` (eval SC + IA) |

La feature actual está en `.specify/feature.json` (`feature_directory`).

## 2. Ejecutar el panel (en paralelo)

Lanza cada agente del conjunto con la tarea de revisar los artefactos de la fase, cada uno según su
definición en `.claude/agents/`. Cada agente devuelve su JSON (`huecos[]` + `veredicto` + `resumen`).
En G3, además, ejecuta `npx promptfoo eval` sobre los Success Criteria de la spec y el componente IA
para obtener las métricas; si algún umbral no se cumple, cuenta como bloqueante del gate.

## 3. Consolidar

Fusiona los informes: deduplica solapamientos (unifica IDs), ordena por severidad, y fija el
**veredicto global = el más restrictivo**. Cuenta los BLOQUEANTES.

Escribe el informe en `docs/gates/gate-G{n}-{feature}.json` y un resumen `.md` con la tabla de huecos.

## 4. Decidir

- **0 BLOQUEANTES →** GATE **PASS**. Informa y permite continuar (el commit git del hook posterior
  procede).
- **≥1 BLOQUEANTE →** GATE **FAIL**. Invoca el agente **`remediador`** con el informe consolidado + los
  artefactos para producir un plan de propuestas, y guárdalo en
  `docs/gates/gate-G{n}-{feature}-propuestas.md`. **Detén el avance**: no se continúa ni se commitea
  hasta resolver los bloqueantes y re-ejecutar el gate.

## 5. Reglas

- Un BLOQUEANTE es un hallazgo que impide implementar/testear un requisito, abre un agujero de
  seguridad, o rompe un principio de la constitution.
- Los BLOQUEANTES y los principios de seguridad (IV/IX/XI) **no son excepcionables** (Governance).
- El `remediador` **propone**, no aplica; la corrección la revisa un humano y la re-valida el siguiente
  pase del gate (separación de funciones).

> Variante headless/CI: `scripts/gate.sh --phase G{n} --feature-dir <ruta>` reproduce este flujo con
> exit code 0/1 para *branch protection*.
