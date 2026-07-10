# 03 · Informe adversarial consolidado — sobre el reparto (pase nº1)

> Resultado de correr el **panel de 3 agentes** sobre `01-reparto-constitution-vs-spec.md`.
> Cada agente en su carril excluyente. Aquí se fusionan los 29 hallazgos brutos, se deduplican los
> solapamientos y se ordenan por severidad. **Veredicto global = el más restrictivo.**

- **revisor-cinico** (lógica/asunciones/edge/trazabilidad): 15 huecos · REQUIERE_CAMBIOS
- **auditor-spec-theater** (testeabilidad): 7 huecos · BLOQUEADA
- **revisor-rbac-seguridad** (acceso/datos): 7 huecos · BLOQUEADA

## 🔴 VEREDICTO GLOBAL: BLOQUEADA

Criterio de avance (aprendizaje Módulo 8): no exigimos 0 huecos, pero **0 BLOQUEANTES** antes de
destilar principios y correr `/speckit-specify`.

---

## Resumen por severidad

| Severidad | Nº | IDs consolidados |
|---|---|---|
| 🔴 BLOQUEANTE | 8 | U-01 … U-08 |
| 🟠 ALTA | 9 | U-09 … U-17 |
| 🟡 MEDIA | 6 | U-18 … U-23 |

---

## 🔴 BLOQUEANTES (hay que cerrarlos antes de avanzar)

| ID | Tema | Origen | Pregunta crítica |
|---|---|---|---|
| **U-01** | Falta FR de **creación / asignación inicial** (draft→assigned): ningún FR dice quién crea la orden ni con qué datos | H-002 | ¿La creación de órdenes está fuera de alcance (declarado) o hay un FR con actor y datos mínimos? Sin él no hay test end-to-end. |
| **U-02** | Falta FR de **inicio de trabajo** (assigned→in_progress): transición sin actor ni criterio | H-013 | ¿Hay acción explícita "iniciar orden" del técnico, o in_progress es implícito al subir la 1ª evidencia? |
| **U-03** | **Aislamiento por equipo/tenant** sin definir: AS-03 no acota el ámbito del supervisor → fuga de PII entre ámbitos | S-001 | ¿El supervisor ve TODAS las pending_review del sistema o solo las de su equipo/región? ¿Hay tenant? |
| **U-04** | **Técnico asignado** no verificado: registrar ejecución exige rol=technician pero no que sea *el asignado* → escalada horizontal / IDOR | S-002 | ¿El backend rechaza (403) si un técnico registra ejecución sobre una orden de otro? ¿Valida `assigned_to == usuario`? |
| **U-05** | NFR **"rápido"** sin umbral (`[pendiente de número]`) → no testeable | T-001 | ¿P95 < cuántos ms y sobre qué operaciones? |
| **U-06** | NFR **"seguro"** sin criterio binario (`[pendiente de concreción]`) → no testeable | T-002, S-005 | ¿Qué condiciones concretas: TLS mínimo, cifrado en reposo sí/no, qué campos PII? |
| **U-07** | **Foto de evidencia** sin límites ni definición de "válida" (`[pendiente de límites]`) → no testeable | T-003 | ¿Formatos, tamaño máx/foto, nº máx, y qué hace "válida" a una foto? |
| **U-08** | Regla dura IA **"insuficiente"** sin umbral → "la IA nunca inventa" no es testeable | T-004, H-020(1) | ¿Qué condición medible marca "evidencia/nota insuficiente" (nº caracteres, presencia de foto…)? |

---

## 🟠 ALTAS

| ID | Tema | Origen | Pregunta crítica |
|---|---|---|---|
| **U-09** | Estados **reasignables** no cerrados en el FR (AS-01 es asunción, no requisito) | H-001, T-006, S-003 | ¿Conjunto exacto de estados reasignables, en el propio FR? ¿Se rechaza reasignar closed/pending_review? |
| **U-10** | **Destino del rechazo** ambiguo: FR dice "estado correspondiente", AS-04 dice in_progress | H-005, T-007, S-004 | ¿A qué estado exacto va una orden rechazada? |
| **U-11** | **Evidencia tras reasignar/rechazar**: qué pasa con fotos/notas del técnico anterior | H-001, H-005 | ¿Se conservan con autoría, se descartan, se versionan por intento? |
| **U-12** | **Visibilidad "ver órdenes"** circular y no testeable; falta matriz rol×alcance | H-004, H-015 | ¿Matriz explícita rol × alcance (todas/propias/equipo/estado) como fuente de verdad? |
| **U-13** | **Aprobar/rechazar** solo válido desde pending_review y solo supervisor: no se exige guarda | S-004 | ¿Se rechaza (403/409) aprobar algo que no está en pending_review? |
| **U-14** | **Acceso a ficheros de evidencia** (fotos = PII) sin RBAC por-orden (posible IDOR por URL) | S-005 | ¿Las fotos se sirven tras autorización por-orden o por URL directa? |
| **U-15** | **Fuga de PII vía resumen IA** (salida, logs del proveedor, contexto compartido entre órdenes) | S-006 | ¿Quién puede leer el resumen? ¿Se evita PII bruta en salida/logs? |
| **U-16** | **Concurrencia cruzada** (reasignar mientras el técnico envía / supervisor resuelve) — AS-10 solo cubrió un caso | H-012 | ¿Se detecta conflicto con 409 o gana la última escritura? |
| **U-17** | **Foto corrupta / formato inválido / subida parcial** no cubierto (AS-02 solo cubre 0 fotos) | H-003, H-014 | ¿Se rechaza en el envío o falla después? ¿Persisten fotos ya subidas si se corta la red? |

---

## 🟡 MEDIAS

| ID | Tema | Origen |
|---|---|---|
| **U-18** | Campo **"motivo" de rechazo** sin contrato (obligatorio, longitud, lista vs libre) | H-006 |
| **U-19** | **Inventario de PII** sin definir (qué campos/entidades son PII; fotos con rostros/matrículas) | H-007 |
| **U-20** | **SLA de la IA** ausente (AS-07 la excluye del CRUD pero no fija límite propio ni timeout) | H-009, T-005 |
| **U-21** | **Dependencia oculta de aviso**: sin push/dashboard, ¿cómo sabe el técnico que le rechazaron / el supervisor que hay pendientes? | H-010, H-016 |
| **U-22** | **Resumen IA obsoleto/versionado**: notas cambian tras generar el resumen; ¿se recalcula, se versiona? | H-008, H-014(cinico) |
| **U-23** | **403 vs 404** al pedir orden ajena por ID (enumeración de IDs) | S-007 |
| **U-24** | **i18n de la IA**: notas en idioma distinto → riesgo de "inventar" al traducir | H-011 |
| **U-25** | **Bucle de rechazos** sin límite ni escalado | H-005(cinico) |

---

## Trazabilidad de la consolidación

- Solapamientos fusionados: estados reasignables (H-001+T-006+S-003 → **U-09**); destino del rechazo
  (H-005+T-007+S-004 → **U-10**); visibilidad (H-004+H-015+S-001, separando testeabilidad de
  aislamiento → **U-12** y **U-03**); NFR seguro + cifrado reposo (T-002+S-005 → **U-06**, con la parte
  de ficheros en **U-14**).
- Veredicto global BLOQUEADA porque dos agentes (auditor y RBAC) devolvieron BLOQUEADA y hay 8
  bloqueantes acumulados.

## Siguiente paso

Resolver con el usuario los **8 BLOQUEANTES (U-01…U-08)** y las ALTAS de diseño (U-09, U-10, U-12).
Con las respuestas se actualizan las asunciones `AS-xx` del reparto y se destilan los principios
verificables de la constitution.
