# FieldOps · Proyecto Final SDD — Documentación y bitácora

> Este `docs/` es a la vez **manual de consulta** (cómo se aborda un proyecto con Spec-Driven
> Development reforzado con revisión adversarial) y **bitácora de evolución** (qué problemas
> aparecieron y cómo se atacaron). Está pensado para reutilizarse ante proyectos parecidos.

---

## Qué es este proyecto

Slice de **FieldOps** (gestión de órdenes de trabajo) construido como proyecto de cierre del curso SDD.
El objetivo no es el volumen de código, sino **demostrar dominio del flujo Spec Kit de principio a
fin**, dejando que la especificación gobierne el código y **poniendo en duda de forma sistemática lo
que damos por sentado**.

## Metodología en una frase

> **Convertir un brief ambiguo en artefactos verificables, y en cada punto crítico ejecutar un panel
> adversarial que intente romper lo que creemos correcto — antes de avanzar.**

Tres pilares:
1. **SDD / Spec Kit**: constitution → specify → clarify → checklist → plan → tasks → analyze → implement.
2. **EARS + anti spec-theater**: ningún requisito ambiguo; todo reescribible como test pass/fail.
3. **Panel adversarial de focos excluyentes**: tres agentes que atacan lógica, testeabilidad y seguridad.

---

## Mapa de documentos

| Doc | Contenido |
|---|---|
| [00-brief-original.md](00-brief-original.md) | El brief de negocio tal cual llegó (fuente de verdad). |
| [01-reparto-constitution-vs-spec.md](01-reparto-constitution-vs-spec.md) | Reparto de la información: qué es principio (constitution) y qué es comportamiento (spec). Incluye las **asunciones `AS-xx`** y las **decisiones tras el pase adversarial**. |
| [02-plan-de-ataque.md](02-plan-de-ataque.md) | Orden de fases Spec Kit y cómo encaja el panel adversarial. |
| [03-adversarial-reparto.md](03-adversarial-reparto.md) | Informe consolidado del panel de 3 sobre el reparto (25 huecos únicos, 8 bloqueantes). |
| [04-principios-constitution.md](04-principios-constitution.md) | Los 13 principios **verificables** destilados (input de `/speckit-constitution`) + stack + arquitectura. |
| [05-automatizacion-sdd.md](05-automatizacion-sdd.md) | Rama por spec + los tres gates adversariales (clarify / analyze / implement) y su mecanismo. |
| [06-roadmap.md](06-roadmap.md) | Descomposición del alcance en features/specs con orden y dependencias. |
| [07-adversarial-constitution.md](07-adversarial-constitution.md) | Pases adversariales sobre la constitution (nº2 y nº2b) y convergencia a v1.2.x. |
| [08-niveles-configuracion.md](08-niveles-configuracion.md) | Qué vive a nivel proyecto / usuario / organización. |
| [09-glossary.md](09-glossary.md) | Lenguaje ubicuo del dominio (anti-ambigüedad). |
| [10-evals-promptfoo.md](10-evals-promptfoo.md) | Decisión build-vs-buy: evals con promptfoo. |
| [11-eficiencia-tokens.md](11-eficiencia-tokens.md) | Ahorro de tokens: deterministic-first, model tiering, RTK (fase implementación). |
| [12-estrategia-tests.md](12-estrategia-tests.md) | Pirámide de test, profundidad/umbrales, BD en tests, E2E gated. |
| [adr/](adr/) | ADRs (0000 plantilla · 0001 arquitectura y stack · 0002 auth · 0003 persistencia y tests). |

> Los **informes generados** viven fuera de `docs/`: los de **tokens** en `informes/` (analítica); los
> de **gate** en `specs/<feature>/gates/` (co-localizados con su feature, son artefactos de trabajo).

## Los agentes del panel (`.claude/agents/`)

| Agente | Carril excluyente | Salida |
|---|---|---|
| `revisor-cinico` | Coherencia lógica, asunciones ocultas, edge cases funcionales, trazabilidad, requisitos faltantes | JSON `huecos[]` (H-###) |
| `auditor-spec-theater` | Testeabilidad/mensurabilidad, medida con test objetivo (EARS / 2-implementaciones / pass-fail) | JSON `huecos[]` (T-###) |
| `revisor-rbac-seguridad` | Control de acceso: privilegios, transiciones, 401/403/404, PII, fugas entre roles | JSON `huecos[]` (S-###) |
| `revisor-consistencia` (G2) | Verificación **independiente** de consistencia spec↔plan↔tasks + trazabilidad (no repite `/speckit-analyze`) | JSON `huecos[]` (K-###) |
| `revisor-implementacion` (G3) | Implementación vs spec + contrato + tests, controles de seguridad aplicados | JSON `huecos[]` (I-###) |
| `remediador` | Proposer: propone cambios por hueco (no aplica; el que propone no valida) | JSON `propuestas[]` |

Todos devuelven el mismo esquema (`huecos[]` + `veredicto` + `resumen`) para poder **consolidar**.

---

## Bitácora de decisiones (cómo atacamos cada problema)

> Orden cronológico. Cada entrada: problema → decisión → porqué.

**B1 · Punto de partida sin ambigüedades.**
Antes de tocar Spec Kit, se fija un `docs/` de planificación (brief, reparto, plan) y un agente
escéptico. *Por qué:* separar "lo que asumimos" de "lo que decidimos" desde el minuto cero.

**B2 · Un solo revisor no basta → panel de focos excluyentes.**
Se detectó que un `revisor-cinico` generalista solapaba seguridad y vaguedad. Se crearon dos
especialistas (`auditor-spec-theater`, `revisor-rbac-seguridad`) y se dio a cada uno un **carril**.
*Por qué:* el Módulo 8 (ej. 99a) demostró que focos excluyentes rinden más que un generalista.

**B3 · "Vaguedad" es, en sí, un término vago.**
El auditor no puede apoyarse en "detecta lo vago". Se reescribió para usar un **test objetivo de 3
comprobaciones** (¿reescribible en EARS? ¿admite ≥2 implementaciones? ¿tiene criterio pass/fail?).
*Por qué:* un criterio subjetivo produce resultados no reproducibles — el mismo defecto que perseguimos.

**B4 · Las definiciones de los agentes también deben estar sin ambigüedad.**
Se auditaron y afinaron las tres definiciones (carriles, formato JSON idéntico, IDs con prefijo).
*Por qué:* un agente mal configurado no sirve; es parte del artefacto verificable.

**B5 · Pase adversarial nº1 sobre el reparto → 8 bloqueantes.**
El panel devolvió BLOQUEADA: faltaban FRs (creación, inicio de trabajo), NFRs no cuantificados, reglas
de acceso sin cerrar, umbral de la IA sin definir. Se consolidaron en `03`. *Por qué:* mejor descubrir
los huecos aquí que en integración.

**B6 · Sin cliente real → resolver con buenas prácticas (SOLID).**
Las asunciones se cerraron con criterios de diseño coherentes: creación fuera de alcance (SRP), inicio
de trabajo explícito (no acoplar), autorización centralizada inyectable (OCP+DIP), evidencia versionada
(auditoría). *Por qué:* en un proyecto de prueba, la mejor práctica sustituye a la decisión de negocio.

**B7 · Estándares del curso, no invención.**
Se minaron los ejercicios para adoptar lo ya fijado: contract-first con OpenAPI, errores accionables,
Zod derivado del contrato, TDD con fase Red, trazabilidad RF→test, idempotencia/concurrencia,
observabilidad. *Por qué:* reutilizar estándares probados > inventar.

**B8 · Decisiones de arquitectura y stack.**
Arquitectura **hexagonal** (máxima expresión SOLID para un slice); stack **TS/Node** (el más común y
mejor integrado con Claude/Spec Kit, ya que el brief no fija tecnología). *Por qué:* dominio testeable
sin mocks; tooling que el agente maneja con soltura.

**B9 · Las plantillas de Spec Kit deben imponer la calidad.**
Personalización completa de las plantillas (EARS obligatorio, sección de contrato, matriz de
trazabilidad, sección de eval-IA, gates de contract-first/RBAC/arquitectura). *Por qué:* que la calidad
no dependa de la memoria, sino de la plantilla.

**B10 · SDD automatizado con gates en los puntos que importan.**
Rama por spec; panel adversarial como gate **tras clarify, tras analyze y tras implement+tests**, vía
extensión de Spec Kit. Criterio: 0 bloqueantes. *Por qué:* automatizar el escrutinio donde más reduce
el riesgo de ambigüedad y de errores de planteamiento/implementación.

**B11 · Documentarlo todo.**
Este `docs/` como manual de consulta + bitácora. *Por qué:* que la evolución y el "cómo se atacó cada
problema" queden como activo reutilizable.

---

**B12 · Constitution generada y endurecida por adversarial.**
`/speckit-constitution` produjo v1.0.0 (13 principios). Dos pases adversariales (nº2 y nº2b, docs/07)
la llevaron a **v1.2.1** (14 principios): resueltos retención-vs-auditoría, PII en egreso/campos, gate
vs excepciones, organización única. *Por qué:* aplicar el adversarial a la propia constitution;
convergencia en 0 bloqueantes (M8), no en 0 hallazgos.

**B13 · Gates = verificación independiente, no duplicación.**
Los agentes re-pasan lo que ya hacen `/speckit-analyze` y `/speckit-checklist`, pero su valor es ser una
**segunda mirada neutral** (el que propone no valida). *Por qué:* el auto-análisis del autor está
sesgado; un revisor hostil e independiente caza lo que aquél racionaliza.

**B14 · Cierre del ciclo con el `remediador` (proposer).**
Añadido el proposer del patrón M8: propone cambios por hueco, no los aplica. *Por qué:* separar proponer
de validar acelera la convergencia sin auto-aprobación.

**B15 · Build-vs-buy: evals con promptfoo, no motor propio.**
Investigado (promptfoo/DeepEval/Ragas). Se adopta **promptfoo** (TS/Node, CI-first). *Por qué:* no
reinventar tooling maduro; los agentes (prompts) sí son custom porque son baratos y específicos.

**B16 · Automatización + entorno + calidad.**
Extensión git (rama por spec) + extensión `speckit-gate` (hooks acumulativos, antes del commit) +
`scripts/gate.sh`; plantillas Spec Kit personalizadas (EARS, contrato, trazabilidad, eval, gates);
CI (gitleaks + install/lint/test/eval), README, PR template, CODEOWNERS, lint config (Principio XII),
`.env.example`, ADRs. Niveles de config en docs/08.

**Backlog (fase de implementación):** agentes especializados por lenguaje/front/back en G3; adaptador
MCP sobre promptfoo si se quiere reutilizar fuera de Claude.

**B17 · Decisiones de fundación (constitution v1.3.0).**
Postgres 16 en Docker en todos los entornos (se descarta SQLite); auth JWT access+refresh/argon2id
(ADR-0002); persistencia y BD de test (ADR-0003); sección Convenciones (Result/Either en dominio,
API `/v1`, Conventional Commits, Makefile). *Por qué:* el brief no fija tecnología → se elige el
estándar más común y con paridad de entornos (Docker), documentando que son decisiones de proyecto.

**B18 · Estrategia de test explícita (docs/12).**
Pirámide unit(dominio)/integración(BD real)/contract/seguridad + evals; umbrales por capa; TDD fase Red;
Postgres docker-compose con BD de test independiente y seed para POV; **E2E stretch de lanzamiento
justificado** (coste). *Por qué:* fijar profundidad riesgo-dirigida sin gold-plating ni gasto innecesario.

**B19 · Organización de carpetas por propósito.**
`docs/` = documentación escrita a mano; `informes/` = analítica (tokens); `specs/<feature>/gates/` =
informes de gate (artefactos de trabajo, co-localizados con su feature). *Por qué:* separar generados de
documentación, pero manteniendo en el flujo lo que speckit/claude usan al trabajar.

**B20 · CLAUDE.md operativo.**
Guía de trabajo en el repo (reglas de oro, stack, flujo con gates, sin API, no-hacer) que apunta a la
constitution. *Por qué:* que cada sesión futura arranque alineada sin releer todo.

---

*(La bitácora se actualiza a medida que avanza el proyecto: specs, gates ejecutados, etc.)*
