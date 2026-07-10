# 07 · Informe adversarial consolidado — sobre la constitution v1.0.0 (pase nº2)

> Panel de 3 agentes corrido sobre `.specify/memory/constitution.md` (v1.0.0).
> **Veredicto global: REQUIERE_CAMBIOS (2 BLOQUEANTES).** No pasa el gate → enmienda a v1.1.0.

- **revisor-cinico** (lógica/contradicciones/gobernanza): 12 huecos · REQUIERE_CAMBIOS
- **auditor-spec-theater** (testeabilidad de las líneas `Verificación:`): 8 huecos · REQUIERE_CAMBIOS
- **revisor-rbac-seguridad** (controles de acceso/datos): 4 huecos · REQUIERE_CAMBIOS

---

## 🔴 BLOQUEANTES

| ID | Tema | Origen | Resolución en v1.1.0 |
|---|---|---|---|
| **C-01** | **Contradicción IX (retención/borrado PII) vs XI (evidencia inmutable perpetua)**: ¿qué manda cuando expira la retención sobre una foto que la auditoría exige conservar? | H-001 | Separar **auditoría inmutable** (metadatos: actor/timestamp/acción/motivo + **referencia/hash** de la evidencia) de la **PII/payload** (fotos/notas), que sí está sujeta a retención y puede purgarse/anonimizarse. La auditoría conserva la referencia, no el binario. |
| **C-02** | **"Fotos válidas" sin definir** (VIII): el fallback de la IA y su eval no son implementables. Además, el umbral concreto (0 fotos / <20 chars) es **de feature**, no de constitution. | T-001, H-003 | **Sacar de la constitution los umbrales de feature**; VIII referencia "según umbral definido en la spec y verificado por eval". La definición de "válida" vive en la spec. |

---

## 🟠 ALTAS (se resuelven en v1.1.0)

| ID | Tema | Origen | Resolución |
|---|---|---|---|
| **C-03** | Fase Red (VII) no verificable con "tests en verde" | T-003 | Verificar por **commit de test en rojo previo** al de implementación (análogo a I). |
| **C-04** | "Temperatura baja" (VIII) sin número | T-002 | Fijar valor en spec (p. ej. ≤ 0.2). |
| **C-05** | Cobertura (VII) ambigua: agregada vs por capa, meta vs gate | T-004 | **Gate duro por capa** (dominio ≥80% Y servicios ≥80%). |
| **C-06** | "URLs firmadas caducas" (IX) sin TTL | T-005 | TTL máximo en spec (p. ej. ≤ 300 s). |
| **C-07** | "Cifrado en reposo" (IX) sin test/estándar | T-008 | Añadir comprobación + estándar (AES-256). |
| **C-08** | `any` injustificado / SOLID (XII) no binario | T-006, T-007 | Regla de lint: cero `any` salvo `// JUSTIFICACIÓN:` adyacente; SOLID → límites + reglas lint. |
| **C-09** | **PII en la salida de la IA** no controlada | S-001 | Principio: la IA **no reproduce PII** en su salida; **golden case de no-fuga** en la eval. |
| **C-10** | **Estado de origen** en transiciones no validado | S-002 | Cada transición valida estado origen: **403** (rol/pertenencia) vs **409/422** (estado inválido); test negativo por transición. |
| **C-11** | **Auditoría de accesos denegados** ausente | S-003 | Registrar de forma inmutable los intentos 401/403/404 (actor/endpoint/recurso). |
| **C-12** | **Ciclo de vida de auth/sesión** no definido | S-004 | Principio: expiración/revocación de sesión; sesión caducada/revocada → 401; ancla `assigned_to == usuario`. |
| **C-13** | **Multi-tenant** no declarado en alcance (IV asume org única) | H-008 | Declarar multi-tenant **explícitamente fuera de alcance**; la política de visibilidad queda inyectable (OCP). |

---

## 🟡 MEDIAS (se resuelven o se anotan)

| ID | Tema | Origen | Resolución |
|---|---|---|---|
| **C-14** | "0 bloqueantes" sin definir qué es BLOQUEANTE ni arbitraje del panel | H-002 | Gobernanza: definir severidad BLOQUEANTE y regla de arbitraje (la más restrictiva gana). |
| **C-15** | Spec-first (I) verificable por orden de commits, manipulable | H-005 | Aceptado como control best-effort; reforzado por rama por spec + gates. |
| **C-16** | EARS (V) verificado por criterio no determinista | H-006 | El auditor usa el **test objetivo de 3 comprobaciones** (ya en su definición). |
| **C-17** | "100% contract tests" (II) sin base de cálculo | H-007 | Definir: cada operationId × código de respuesta documentado tiene test. |
| **C-18** | Retención (IX) verificada solo por "existe documento" | H-009 | Añadir test de expiración/purga de PII. |
| **C-19** | Estado seed inicial sin auditoría real | H-010 | Nota: los datos semilla registran un actor de sistema en la auditoría. |
| **C-20** | Autoridad de excepciones (Governance) | H-011 | Definir que la excepción la aprueba alguien distinto al autor; evidencia en PR. |
| **C-21** | "Definición de hecho" no incluye gates ni eval | H-012 | "Hecho" = tests verde **+ gate adversarial 0 bloqueantes + eval en umbral**. |

---

## Cómo se refleja en v1.1.0

- Reescritura de **VIII** (umbrales → spec; no-fuga PII), **IX/XI** (separación auditoría/PII + retención
  testeable), **VII** (fase Red por commit rojo; cobertura por capa), **IV** (estado origen; ciclo de
  auth), **XII** (lint), **XIII** (encadenado acumulativo + agentes por gate; definición de BLOQUEANTE).
- Nuevo principio: **cada spec define Success Criteria medibles evaluados como métricas** (eval MCP).
- **Alcance:** multi-tenant fuera; nota de auditoría del estado seed.
- **Governance:** BLOQUEANTE + arbitraje + autoridad de excepciones; "definición de hecho" ampliada.
- Bump **1.0.0 → 1.1.0** (MINOR: correcciones + controles nuevos).

Tras enmendar, **re-ejecutar el panel** hasta veredicto sin bloqueantes.

---

## Pase nº2b — sobre la constitution v1.1.0 (re-verificación)

Confirmado que los 2 bloqueantes originales (C-01 retención/auditoría, C-02 fotos válidas) quedaron
resueltos. El panel, como es su naturaleza, encontró capas más profundas:

- **cínico:** 1 BLOQUEANTE (H-001) + varias altas.
- **auditor:** 0 bloqueantes (residuos de mensurabilidad).
- **rbac:** 1 "bloqueante" (S-001) + altas.

### Clasificación y resolución → v1.2.0

| Hallazgo | Severidad real | Decisión |
|---|---|---|
| **H-001** gobernanza "excepción" vs gate "0 bloqueantes" | 🔴 BLOQUEANTE (contradicción interna) | **Resuelto en v1.2.0:** los BLOQUEANTES del gate y los principios de seguridad (IV/IX/XI) **no son excepcionables**; excepciones solo para ALTA/MEDIA no-seguridad, aprobadas por alguien competente. |
| **S-001** aislamiento por equipo/región para supervisor/dispatcher | 🟠 no-bloqueante (ya decidido) | **Decisión previa (docs/01 §D U-03):** organización **única y plana**, sin sub-ámbito. Explicitado en el Principio IV de v1.2.0. |
| **S-002** egreso de PII cruda al proveedor de IA | 🟠 ALTA | **Resuelto en v1.2.0:** VIII exige minimizar/redactar PII antes de enviarla a terceros. |
| **H-002/H-009** PII en `motivo`/`recurso` de auditoría | 🟠 ALTA | **Resuelto en v1.2.0:** esos campos no almacenan PII cruda; lectura de auditoría por RBAC. |
| **T-001** plazo de retención sin valor | 🟠 ALTA | **Resuelto:** plazo delegado a la spec (como TTL/temperatura). |
| **T-002** TTL "p. ej. ≤300 s" no vinculante | 🟡 MEDIA | **Resuelto:** TTL normativo **≤ 300 s**. |
| H-003 SC "gameables" (XIV) / H-004 autoridad de excepción | 🟠 ALTA | Autoridad de excepción con competencia (v1.2.0); "SC significativos" se controla en G2 (revisor-consistencia) y en la plantilla de spec. |
| T-003 spec-first best-effort / T-004 EARS auto-referencial / H-005 "servicios" vs capas / H-006 dos fuentes de verdad / H-010 lint de `any` sintáctico / S-003 RBAC lectura auditoría / H-007 seed reproducible / H-008 evidencia purgada (410) | 🟡 MEDIA | **Backlog / nivel spec:** se anotan; se atienden al redactar specs y plantillas (no son contradicciones de constitution). |

### Convergencia (disciplina Módulo 8)

> El criterio es **0 BLOQUEANTES**, no 0 hallazgos. Un tercer pase completo encontraría siempre más
> matices (rendimiento decreciente). Resuelto el único bloqueante de constitution (H-001) y bajadas las
> demás mejoras a v1.2.0 o a backlog de spec, **damos la constitution por convergida en v1.2.0**. Las
> MEDIAS residuales se abordan cuando se redacten las specs (donde de hecho pertenecen).

---

## Pase nº3 — auditoría NEUTRAL contra el brief (agente `auditor-brief`)

A petición de "estar seguros de que la constitution está a la altura", se creó un agente **neutral**
(`auditor-brief`) que contrasta la constitution contra el **brief** (fuente de verdad), midiendo
cobertura, fidelidad y proporcionalidad. No ataca ni defiende: contrasta y cita el brief.

### 🟢 Veredicto: A_LA_ALTURA

- **Cobertura:** los 5 puntos del slice + RBAC (401/403/404/409) + contract-first + trazabilidad +
  IA-con-fallback+eval + "install/test en limpio" + fuera-de-alcance declarado → **CUBIERTO**.
  Único PARCIAL: "rápido" no cuantificado en la constitution → **delegado a los Success Criteria de la
  spec** (decisión del usuario; es su sitio en el flujo).
- **Fidelidad:** fiel al brief; **alcance 1:1** con el enunciado (ninguna feature de más).
- **Proporcionalidad:** hexagonal (III), idempotencia/concurrencia (X) y lint (XII) van *más allá* de lo
  que el brief exige ("stack libre"), pero son **"cómo"/calidad, no alcance**, y responden a la dirección
  explícita del usuario (SOLID). Se **mantienen como principios** y se documenta su naturaleza de
  decisión de proyecto (nota de honestidad en la constitution + ADR-0001).

### Acciones derivadas (v1.2.2)

- Nota de honestidad añadida (hexagonal/robustez/lint = decisiones de proyecto, ADR-0001).
- Sync Impact Report corregido (plantillas ✅, infraestructura en su sitio).
- "Rápido" se deja para los SC de la spec (no se cuantifica en la constitution).

> Con esto damos la constitution por **validada contra el brief** y estable en **v1.2.2**.


