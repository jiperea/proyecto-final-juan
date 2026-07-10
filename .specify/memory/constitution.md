<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0 → 1.2.0 → 1.2.1
Tipo de cambio: MINOR. v1.1.0 tras pase adversarial nº2; v1.2.0 tras re-verificación (nº2b): resuelve la
contradicción gobernanza-vs-gate (H-001), explicita organización única/plana, minimiza PII en el egreso
a la IA y en campos de auditoría, y delega el plazo de retención a la spec.
Ver docs/07-adversarial-constitution.md.
v1.2.1 (PATCH): XIV referencia el framework de eval adoptado (promptfoo) en vez de un MCP propio;
ver docs/10-evals-promptfoo.md.

Principios (14):
  I.    Spec-Driven, spec-first
  II.   Contract-First con OpenAPI
  III.  Arquitectura Hexagonal (puertos y adaptadores)
  IV.   RBAC en doble capa, mínimo privilegio y ciclo de vida de la sesión   [ampliado]
  V.    Requisitos en EARS, sin ambigüedad
  VI.   Trazabilidad RF → endpoint → tarea → test
  VII.  TDD con fase Red verificable                                          [ampliado]
  VIII. La IA nunca inventa ni filtra PII (anclada a eval)                    [ampliado]
  IX.   Seguridad de datos y PII (retención vs auditoría resuelta)           [ampliado]
  X.    Robustez operacional (errores, idempotencia, concurrencia, observabilidad)
  XI.   Auditoría append-only (metadatos inmutables + accesos denegados)      [ampliado]
  XII.  Simplicidad, SOLID y límites de código (reglas de lint)              [ampliado]
  XIII. Gates de revisión adversarial encadenados y acumulativos             [ampliado]
  XIV.  Objetivos evaluables por métricas (Success Criteria + eval)           [NUEVO]

Cambios v1.0.0 → v1.1.0:
  - VIII: umbrales concretos movidos a la spec; añadido "no filtrar PII en la salida".
  - IX/XI: separación auditoría inmutable (metadatos + referencia/hash) vs PII/payload (retenible).
  - VII: fase Red verificable por commit de test en rojo previo; cobertura por capa.
  - IV: validación de estado de origen (403 vs 409) + ciclo de vida de sesión.
  - XII: reglas de lint concretas (any, tamaños).
  - XIII: encadenado acumulativo + agentes especializados por gate + definición de BLOQUEANTE.
  - XIV nuevo: SC medibles evaluados como métricas (MCP eval-objetivos).
  - Alcance: multi-tenant declarado fuera; nota de auditoría del estado seed.
  - Governance: definición de BLOQUEANTE + arbitraje; autoridad de excepciones; definición de "hecho" ampliada.

Plantillas dependientes (⚠ pendientes de personalización):
  - .specify/templates/spec-template.md, plan-template.md, tasks-template.md, checklist-template.md
-->

# FieldOps Constitution

> Slice de reasignación, ejecución y revisión de órdenes de trabajo. Reglas no negociables: la
> especificación gobierna el código y todo lo que se afirma debe poder verificarse. Los principios son
> **testables**, no decorativos. Enmendada tras revisión adversarial (docs/07).

## Alcance del slice

- **Dentro:** reasignar orden (dispatcher); iniciar trabajo y registrar ejecución con evidencia
  (technician); aprobar/rechazar en `pending_review` (supervisor); RBAC; asistente de IA que resume la
  incidencia de una orden.
- **Fuera (declarado):** creación/alta inicial de órdenes (`draft→assigned`; datos semilla, ver nota de
  auditoría en XI); **multi-tenant / multi-organización** (la política de visibilidad se diseña
  inyectable para soportarlo en el futuro, pero el aislamiento entre organizaciones NO entra ni se
  testea en el slice); dashboard de métricas; notificaciones push; i18n.

## Core Principles

### I. Spec-Driven, spec-first
Ningún código sin spec aprobada. Flujo
`constitution → specify → clarify → checklist → plan → tasks → analyze → implement`, con **una rama por
spec** (`NNN-feature`) y **commits separados** que demuestran que la spec precede al código.
- **Verificación:** el historial de la rama muestra el commit de spec antes que el de implementación;
  existe una rama por spec. (Control best-effort; reforzado por rama-por-spec y por los gates XIII.)
- **Rationale:** la ambigüedad no resuelta se paga en integración.

### II. Contract-First con OpenAPI
El contrato **OpenAPI 3.1** se versiona en `contracts/` **antes** de implementar y es la **única fuente
de verdad** de frontend y backend. Tipos y validación (Zod) se **derivan** del contrato. Frontera de
nombres: `snake_case` externo ↔ `camelCase` interno, transformando en el boundary.
- **Verificación:** no hay commit de endpoint sin commit previo de su contrato en la misma rama;
  `openapi-typescript` genera tipos y el build falla ante divergencia; **cada `operationId` × código de
  respuesta documentado** (200/4xx/5xx) tiene un contract test.
- **Rationale:** los breaking changes salen en compilación, no en producción.

### III. Arquitectura Hexagonal (puertos y adaptadores)
Capas **Dominio** (lógica pura), **Handlers/Aplicación** (orquestación HTTP) e **Infraestructura**
(DB, externos, IA). El dominio recibe dependencias por inyección (puertos) y se testea **sin mocks de
infraestructura**.
- **Verificación:** los ficheros de `domain/` no importan Express/Prisma/SDK-IA (grep/lint de
  arquitectura); los tests de dominio corren sin base de datos.
- **Rationale:** DIP y SRP; dominio aislado, testeable y estable frente a cambios de infra.

### IV. RBAC en doble capa, mínimo privilegio y ciclo de vida de la sesión
La autorización vive en el **backend** y rechaza aunque se fuerce la petición. Se distingue **401** (no
autenticado o sesión caducada/revocada), **403** (autenticado sin permiso), **404** (recurso ajeno, no
filtrar existencia) y **409/422** (estado de origen inválido para la transición). Cada acción valida
**rol y pertenencia** (`assigned_to == usuario`) **y el estado de origen** de la transición. La política
de visibilidad es **centralizada e inyectable** (matriz rol×alcance), mínimo privilegio por defecto. En
el slice la organización es **única y plana** (sin equipos/regiones): el supervisor ve todas las órdenes
en `pending_review` y el dispatcher todas las reasignables; no hay sub-ámbito intra-organización (el
multi-tenant queda fuera de alcance y la matriz inyectable permite añadirlo sin reescribir). La sesión
tiene **expiración y revocación** definidas; una sesión caducada/revocada devuelve 401.
- **Verificación:** test negativo por endpoint y rol no autorizado a nivel de API; test de transición
  disparada desde estado inválido → 409/422; test de acceso a recurso ajeno → 404; test de sesión
  caducada/revocada → 401; tests de la matriz rol×alcance.
- **Rationale:** el peor actor fuerza la API directamente; separar "no puede" de "no procede".

### V. Requisitos en EARS, sin ambigüedad
Todo FR se redacta en **EARS**: *WHEN [condición] THE [sistema] SHALL [acción] [resultado medible]*, y
cumple el **test de la pregunta cero**.
- **Verificación:** el `auditor-spec-theater` (test objetivo de 3 comprobaciones: EARS /
  2-implementaciones / pass-fail) no reporta enunciados que fallen; cero términos sin cuantificar.
- **Rationale:** si un texto admite ≥2 implementaciones válidas, es teatro, no especificación.

### VI. Trazabilidad RF → endpoint → tarea → test
Cada requisito se mapea a ≥1 endpoint, ≥1 tarea y ≥1 test nombrable.
- **Verificación:** `docs/traceability.md` mantiene la matriz completa; cada FR tiene ≥1 test asociado.
- **Rationale:** un requisito no verificable no está terminado.

### VII. TDD con fase Red verificable
Los tests se escriben y **fallan (Red)** antes de implementar. Integración con **BD real** (SQLite de
test o contenedor), nunca mocks del ORM; mocks solo para terceros/reloj/aleatoriedad.
- **Verificación:** existe un **commit con el test en rojo previo** al commit de implementación en la
  misma rama; CI ejecuta unit + contract + integration en verde; cobertura como **gate duro por capa**
  (dominio ≥ 80% **y** servicios ≥ 80%) y 100% de contratos y de transiciones de estado.
- **Rationale:** el test primero fuerza el diseño y previene regresiones; "verde" no prueba Red.

### VIII. La IA nunca inventa ni filtra PII (anclada a eval)
El asistente **declara "evidencia insuficiente" y no inventa** cuando la evidencia no alcanza el
**umbral definido en la spec** (la spec fija qué es una foto "válida", el nº mínimo y la longitud
mínima de notas). Cita la evidencia por afirmación, opera a la **temperatura definida en la spec** y
**no reproduce PII** (nombres completos, direcciones, matrículas) en su salida. Antes de enviar
notas/evidencia al **proveedor externo de IA**, el puerto de dominio **minimiza/redacta la PII** (no se
envía PII cruda a terceros).
- **Verificación:** eval en `/evals` con golden cases; umbrales `faithfulness ≥ 0.90`,
  `tasa_alucinacion ≤ 0.05`, y **golden case de no-fuga de PII** que debe pasar; el gate de eval bloquea
  si no se cumplen. Los umbrales numéricos de disparo del fallback viven en la spec, no aquí.
- **Rationale:** un resumen inventado o con PII filtrada sobre datos de cliente es un riesgo mayor que
  no resumir.

### IX. Seguridad de datos y PII
TLS 1.2+ obligatorio; **cifrado en reposo** de PII y fotos (AES-256); acceso a evidencia solo tras
autorización por-orden (URLs firmadas con **TTL máximo ≤ 300 s**);
**redacción de PII en logs**; **política de retención** (plazo definido en la spec) con
purga/anonimización al vencer el plazo.
Inventario explícito de campos PII. La retención aplica al **payload PII** (fotos/notas), no al registro
de auditoría (ver XI).
- **Verificación:** test de que las fotos no son accesibles por URL directa sin autorización y de que
  la URL firmada expira dentro del TTL; test/estándar de cifrado en reposo; grep de que los logs no
  emiten PII; **test de expiración/purga** de PII tras el plazo; documento de inventario PII + retención.
- **Rationale:** manejamos datos de clientes; una fuga es el peor fallo posible.

### X. Robustez operacional
Contrato de errores `{ code, message, details, agent_action }` con HTTP correcto (404/409/410/422/503).
Operaciones que cambian estado **idempotentes** mediante **clave de idempotencia** (un reintento con la
misma clave devuelve el resultado ya aplicado, no 409); la **concurrencia** se controla con **versión
(If-Match → 409)** cuando el estado esperado no coincide. Logging estructurado (pino) con
`requestId/actorId/entityId/action`; `/health` y `/ready`.
- **Verificación:** contract tests de errores por código; test de doble-envío con misma
  idempotency-key → mismo resultado; test de edición concurrente con versión obsoleta → 409; los
  endpoints de salud responden.
- **Rationale:** idempotencia y concurrencia son ejes distintos: la clave de idempotencia evita el
  doble efecto; la versión detecta el conflicto de estado.

### XI. Auditoría append-only
Cada transición de estado registra, de forma **inmutable**, actor, timestamp, acción, motivo y una
**referencia/hash** de la evidencia (no el binario PII, que sigue la retención de IX). Se registran
también los **accesos denegados** (401/403/404: actor, endpoint, recurso). La evidencia se **conserva
versionada por intento** y con su autor tras reasignar/rechazar, dentro del plazo de retención. Los
campos de texto libre de la auditoría (p. ej. `motivo`) y el campo `recurso` de los accesos denegados
**no almacenan PII cruda** (se usan identificadores opacos / texto saneado); la **lectura** del registro
de auditoría está **restringida por RBAC** (solo supervisor/auditor).
- **Verificación:** test de que una transición crea un registro de auditoría inmutable con referencia a
  la evidencia; test de que un acceso denegado queda registrado; test de que la evidencia previa
  persiste (versionada) tras reasignación/rechazo.
- **Nota (estado seed):** las órdenes creadas por datos semilla registran un **actor de sistema** en la
  auditoría, para no dejar el primer eslabón sin trazabilidad.
- **Rationale:** trazabilidad legal y detección forense de escaladas, sin retener PII más de lo debido.

### XII. Simplicidad, SOLID y límites de código
YAGNI: no se abstrae por futuros hipotéticos. Reglas de **lint** concretas: `strict: true`; **cero
`any`** salvo con comentario `// JUSTIFICACIÓN:` adyacente; funciones ≤ 50 líneas; ficheros ≤ 300
líneas; solo named exports.
- **Verificación:** lint/CI falla ante `any` sin justificación adyacente o ante tamaños excedidos.
- **Rationale:** el slice es pequeño y bien hecho; la complejidad accidental es deuda.

### XIII. Gates de revisión adversarial encadenados y acumulativos
Los gates se ejecutan **tras `clarify` (G1)**, **tras `analyze` (G2)** y **tras `implement` + tests
(G3)**, con **agentes especializados encadenados de forma acumulativa**: G1 = panel de spec
(`revisor-cinico` + `auditor-spec-theater` + `revisor-rbac-seguridad`); G2 = G1 + `revisor-consistencia`;
G3 = G1 + G2 + `revisor-implementacion` + eval de objetivos (XIV). Un hallazgo es **BLOQUEANTE** cuando
impide implementar/testear un requisito, abre un agujero de seguridad, o rompe un principio de esta
constitution; ante discrepancia de severidad entre agentes **gana la más restrictiva**. Criterio de
avance: **0 BLOQUEANTES**.
- **Verificación:** existe un informe de gate por fase en `docs/gates/`; `scripts/gate.sh` devuelve exit
  1 si hay bloqueantes; el flujo no avanza (ni commitea) con bloqueantes abiertos.
- **Rationale:** poner en duda lo dado por sentado en cada punto reduce ambigüedad y caza errores de
  planteamiento e implementación; agentes especializados encadenados > un agente que abarca mucho.

### XIV. Objetivos evaluables por métricas
Cada spec define **Success Criteria (SC) medibles**; se evalúan como **métricas** (pass/fail por SC, %
cubierto) mediante el **framework de evaluación del proyecto (promptfoo)**. Un SC no medible no es válido.
- **Verificación:** en G3, `promptfoo` produce el informe de métricas por SC (y del componente IA); el
  gate falla si algún SC obligatorio o umbral de eval no se cumple.
- **Rationale:** medir el cumplimiento de los objetivos de cada spec, no solo que "los tests pasan".

## Stack Tecnológico y Arquitectura

- **Runtime / Lenguaje:** Node.js 18+ · TypeScript 5 (`strict`).
- **Backend:** Express 4 sobre **arquitectura hexagonal** (`domain/`, `handlers/`, `infra/`).
- **Validación:** Zod, derivado del contrato OpenAPI.
- **Contrato:** OpenAPI 3.1 en `contracts/`.
- **Persistencia:** Prisma con SQLite (dev/test) → PostgreSQL (producción).
- **Frontend:** React 18 + Vite (mínimo, consumiendo el contrato).
- **Tests:** Vitest (unit) · Supertest (integración/contrato).
- **IA:** SDK del proveedor tras un puerto de dominio; eval en `/evals`.
- **Observabilidad:** pino (logging estructurado).
- **Empaquetado:** un comando de instalación y uno de test (ejecutables en máquina limpia).

> El brief no fija tecnología; se adopta TS/Node por ser el más común y el mejor integrado con Claude y
> Spec Kit. El stack es una restricción del proyecto, no un principio: puede evolucionar por enmienda.

## Flujo de Desarrollo y Gates de Calidad

- **Una rama por spec** (`NNN-feature`); commits separados `spec → plan → tasks → código`.
- **Gates adversariales encadenados** (Principio XIII) tras `clarify`, `analyze` e `implement`, vía la
  extensión `speckit-gate`; corren **antes** del commit git; criterio 0 bloqueantes.
- **Contract-first, EARS, trazabilidad y SC medibles** son gates de las plantillas de `spec`/`plan`.
- **Definición de "hecho":** frontend + backend + tests en verde **a la vez**, en máquina limpia, **con
  el gate adversarial en 0 bloqueantes y la eval de objetivos/IA en umbral**.

## Governance

- Esta constitution **prevalece** sobre plantillas, skills y decisiones de implementación. Jerarquía:
  Constitución > plantillas Spec Kit > decisiones de implementación.
- **Enmiendas:** se proponen por escrito, se versionan por **SemVer** (MAJOR: cambios incompatibles;
  MINOR: nuevo principio o guía ampliada; PATCH: aclaraciones) y generan un Sync Impact Report.
- **Excepciones:** una violación requiere justificación explícita **aprobada por alguien distinto de
  quien la introduce y con competencia en el área afectada**, con evidencia en el PR; nunca
  autoaprobación. **Un hallazgo BLOQUEANTE del gate (XIII) y los principios de seguridad (IV, IX, XI)
  NO son excepcionables**: deben resolverse, no sortearse. Las excepciones solo aplican a trade-offs de
  severidad ALTA/MEDIA no relacionados con seguridad.
- **Cumplimiento:** cada PR/revisión verifica los principios aplicables; la complejidad se justifica
  (YAGNI). Los hallazgos de `/speckit-analyze` y del panel adversarial pueden disparar enmiendas.

**Version**: 1.2.1 | **Ratified**: 2026-07-10 | **Last Amended**: 2026-07-10
