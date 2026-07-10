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
| `gates/` | Informes de cada ejecución de gate (se generan durante el flujo). |

## Los agentes del panel (`.claude/agents/`)

| Agente | Carril excluyente | Salida |
|---|---|---|
| `revisor-cinico` | Coherencia lógica, asunciones ocultas, edge cases funcionales, trazabilidad, requisitos faltantes | JSON `huecos[]` (H-###) |
| `auditor-spec-theater` | Testeabilidad/mensurabilidad, medida con test objetivo (EARS / 2-implementaciones / pass-fail) | JSON `huecos[]` (T-###) |
| `revisor-rbac-seguridad` | Control de acceso: privilegios, transiciones, 401/403/404, PII, fugas entre roles | JSON `huecos[]` (S-###) |

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

*(La bitácora se actualiza a medida que avanza el proyecto: constitution generada, specs, gates
ejecutados, etc.)*
