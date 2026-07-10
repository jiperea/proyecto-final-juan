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
v1.2.2 (PATCH): auditoría NEUTRAL vs brief = A_LA_ALTURA (docs/07). Nota de honestidad: hexagonal (III)
e idempotencia/lint (X, XII) son decisiones de proyecto más allá del brief ('stack libre'), ver ADR-0001.
Sync Impact Report actualizado (plantillas ✅).
v1.2.3 (PATCH): Docker + Docker Compose añadidos al stack para paridad de entornos (reproducibilidad,
requisito 'install+test en limpio' y uso multi-persona); no es SOLID.
v1.3.0 (MINOR): decisiones de fundación — PostgreSQL 16 (Prisma) en TODOS los entornos vía Docker
(se descarta SQLite); auth JWT access+refresh/argon2id (ADR-0002); sección Convenciones (Result/Either
en dominio, API /v1, Conventional Commits, Makefile). Roadmap: 001 se divide en 001 (auth+RBAC) y
002 (dominio Order).
v1.4.0 (MINOR): sección "Refuerzos de robustez y control de flujo" — FSM explícito, auditoría atómica,
evidencia validada, IA con procedencia/staleness + rate-limit, seguridad web (helmet/CSRF/rate-limit/
config fail-fast), correlation-ID, spec-freeze, catch-rate de gates, migraciones en CI. (CI/DevOps se
implementa más adelante.)
v1.5.0 (MINOR): anti-scope-creep tras auditoría neutral (docs/07). Refuerzos clasificados MVP vs Stretch:
idempotencia/concurrencia, auditoría forense y staleness IA pasan a **stretch** (no bloquean gate);
auditoría **mínima** obligatoria. Multi-tenant ya **no se diseña para el futuro** (YAGNI). Visibilidad del
technician explícita; NFR "rápido" obligatorio de cuantificar en los SC.
v1.5.1 (PATCH): criterio de clasificación MVP/Stretch = "¿afecta a la base (schema/contrato/arquitectura)?".
Lo base-afectante se diseña ahora (columna `version`, tabla de auditoría en 002) aunque el comportamiento
sea stretch; lo aditivo se difiere. Regla: diseña la base para no reescribirla.
v1.6.0 (MINOR): convenciones técnicas/producto (idioma código-EN/usuario-ES, npm, UUID v7, UTC/ISO-8601,
paginación cursor, WCAG 2.1 AA) + principio de **Design System propio** (tokens, sin librería pesada) +
convención **STRIDE** para features sensibles de seguridad.
v1.6.1 (PATCH): convención de **migraciones reversibles / plan de rollback** (M10). Foundation cerrada.
v1.7.0 (MINOR): principio nuevo **XV. Specs pequeñas y de alcance concreto** (slice pequeño/demostrable;
señal de "demasiado grande" en clarify/gates; regla de no-rollback → implementar por user story). Origen:
retro de la feature 001 (sobredimensionada); 001 queda grandfathered. Plantilla `spec-template` ✅.
v1.7.1 (PATCH): Governance — regla de **enmiendas aisladas** (constitution/fundación en rama/tarea
dedicada, no en ramas de feature; ADR-0004).

Principios (15):
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
  XIV.  Objetivos evaluables por métricas (Success Criteria + eval)
  XV.   Specs pequeñas y de alcance concreto (slice pequeño; no-rollback)      [NUEVO]

Cambios v1.0.0 → v1.1.0:
  - VIII: umbrales concretos movidos a la spec; añadido "no filtrar PII en la salida".
  - IX/XI: separación auditoría inmutable (metadatos + referencia/hash) vs PII/payload (retenible).
  - VII: fase Red verificable por commit de test en rojo previo; cobertura por capa.
  - IV: validación de estado de origen (403 vs 409) + ciclo de vida de sesión.
  - XII: reglas de lint concretas (any, tamaños).
  - XIII: encadenado acumulativo + agentes especializados por gate + definición de BLOQUEANTE.
  - XIV nuevo: SC medibles evaluados como métricas (MCP eval-objetivos → sustituido por promptfoo en v1.2.1).
  - Alcance: multi-tenant declarado fuera; nota de auditoría del estado seed.
  - Governance: definición de BLOQUEANTE + arbitraje; autoridad de excepciones; definición de "hecho" ampliada.

Plantillas dependientes (✅ personalizadas):
  - .specify/templates/{spec,plan,tasks,checklist}-template.md — EARS, contrato, trazabilidad, eval, gates.
Infraestructura en su sitio: agentes (.claude/agents/), extensiones git + speckit-gate, scripts/gate.sh,
CI (.github/workflows/ci.yml), evals con promptfoo (docs/10).
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
  auditoría en XI); **multi-tenant / multi-organización** (organización única y plana; **no se diseña
  para multi-tenant** — YAGNI, Principio XII); dashboard de métricas; notificaciones push; i18n.

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
de visibilidad es **centralizada** (una única fuente de verdad de autorización), mínimo privilegio por
defecto. En el slice la organización es **única y plana** (sin equipos/regiones): el **technician ve
solo sus órdenes asignadas** (`assigned_to == usuario`), el **dispatcher** las reasignables y el
**supervisor** todas las de `pending_review`. El **multi-tenant queda fuera de alcance y NO se diseña
para él** (YAGNI, Principio XII). La sesión
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
Los tests se escriben y **fallan (Red)** antes de implementar. Integración con **BD real: PostgreSQL
vía docker-compose en una BD de test independiente**, nunca mocks del ORM; mocks solo para
terceros/reloj/aleatoriedad. Pirámide: unit (dominio puro, sin BD) · integración (BD real) · contract
(OpenAPI) · negativos de seguridad (RBAC). **E2E (Playwright) es *stretch* y de lanzamiento
justificado** (no corre en el gate/CI por defecto, por coste). Detalle en `docs/12-estrategia-tests.md`.
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
- **Verificación:** existe un informe de gate por fase en `specs/<feature>/gates/`; `scripts/gate.sh` devuelve exit
  1 si hay bloqueantes; el flujo no avanza (ni commitea) con bloqueantes abiertos.
- **Rationale:** poner en duda lo dado por sentado en cada punto reduce ambigüedad y caza errores de
  planteamiento e implementación; agentes especializados encadenados > un agente que abarca mucho.

### XIV. Objetivos evaluables por métricas
Cada spec define **Success Criteria (SC) medibles**; se evalúan como **métricas** (pass/fail por SC, %
cubierto) mediante el **framework de evaluación del proyecto (promptfoo)**. Un SC no medible no es válido.
- **Verificación:** en G3, `promptfoo` produce el informe de métricas por SC (y del componente IA); el
  gate falla si algún SC obligatorio o umbral de eval no se cumple.
- **Rationale:** medir el cumplimiento de los objetivos de cada spec, no solo que "los tests pasan".

### XV. Specs pequeñas y de alcance concreto
Cada spec es un **slice pequeño, demostrable e independiente**, para una tarea muy concreta; el cluster
**complejo/de robustez** se aísla en una spec posterior en vez de meterlo todo en una. El dimensionado es
una decisión **de origen** (roadmap + `/speckit-specify`).
- **Verificación (señal de "demasiado grande"):** si en `/speckit-clarify` o en los gates una feature
  genera **muchísimos hallazgos** o un `tasks.md` **desproporcionado**, es indicio de que debió partirse;
  el roadmap se ajusta para las siguientes.
- **Regla de rollback:** una feature que **ya pasó G1/G2 NO se re-parte** (el coste de re-especificar
  supera el beneficio); se **implementa incrementalmente por user story** (MVP primero). Partir es de
  origen, no un rollback.
- **Rationale:** coherente con "slice pequeño y bien hecho" y "difiere lo no esencial"; una superficie
  grande hace que el panel adversarial encuentre más y retrasa un MVP demostrable. Lección de la retro de
  la **feature 001** (sobredimensionada: ~10 rondas de gate, 66 tareas); 001 queda **grandfathered** —se
  entrega por user story, no se re-parte— por esta misma regla de rollback.

## Stack Tecnológico y Arquitectura

- **Runtime / Lenguaje:** Node.js 18+ · TypeScript 5 (`strict`).
- **Backend:** Express 4 sobre **arquitectura hexagonal** (`domain/`, `handlers/`, `infra/`).
- **Validación:** Zod, derivado del contrato OpenAPI.
- **Contrato:** OpenAPI 3.1 en `contracts/`.
- **Persistencia:** **PostgreSQL 16 (Prisma) en todos los entornos vía Docker** (paridad
  dev=test=prod, sin divergencia de motor; migraciones con Prisma Migrate).
- **Frontend:** React 18 + Vite (mínimo, consumiendo el contrato).
- **Tests:** Vitest (unit) · Supertest (integración/contrato).
- **IA:** SDK del proveedor tras un puerto de dominio; eval en `/evals`.
- **Observabilidad:** pino (logging estructurado).
- **Contenedores:** **Docker + Docker Compose** para **paridad de entornos** (dev/test reproducibles;
  `docker compose up` levanta el entorno igual en cualquier máquina y para cualquier persona). Es
  reproducibilidad/12-factor, no un principio SOLID.
- **Empaquetado:** un comando de instalación y uno de test (ejecutables en máquina limpia; el camino
  reproducible es vía contenedor).

> El brief no fija tecnología; se adopta TS/Node por ser el más común y el mejor integrado con Claude y
> Spec Kit. El stack es una restricción del proyecto, no un principio: puede evolucionar por enmienda.
>
> **Nota de honestidad (auditoría neutral vs brief, docs/07).** El brief dice *"stack libre; importa la
> disciplina, no la tecnología"*. Por tanto la **arquitectura hexagonal (III)** y las disciplinas de
> **robustez/idempotencia (X)** y **lint estricto (XII)** son **decisiones de proyecto** que van más allá
> de lo que el brief exige; se adoptan por criterio de diseño (SOLID) — no inflan el alcance funcional —
> y quedan registradas en `docs/adr/0001-arquitectura-y-stack.md`. Revisables por enmienda.

## Flujo de Desarrollo y Gates de Calidad

- **Una rama por spec** (`NNN-feature`); commits separados `spec → plan → tasks → código`.
- **Gates adversariales encadenados** (Principio XIII) tras `clarify`, `analyze` e `implement`, vía la
  extensión `speckit-gate`; corren **antes** del commit git; criterio 0 bloqueantes.
- **Contract-first, EARS, trazabilidad y SC medibles** son gates de las plantillas de `spec`/`plan`.
- **Definición de "hecho":** frontend + backend + tests en verde **a la vez**, en máquina limpia, **con
  el gate adversarial en 0 bloqueantes y la eval de objetivos/IA en umbral**.

## Convenciones (buenas prácticas)

- **Autenticación:** JWT **access** (corto, en memoria) + **refresh** opaco en cookie HttpOnly
  (revocable); hashing **argon2id**. Cumple el ciclo de sesión del Principio IV (ver `docs/adr/0002`).
- **Errores de dominio con `Result`/`Either`:** el dominio **no lanza excepciones** para errores de
  negocio; devuelve un `Result<Ok, Error>` tipado que los handlers mapean al contrato de errores (X).
- **Versionado de API:** rutas/contrato bajo prefijo **`/v1`** para evolucionar sin romper consumidores.
- **Conventional Commits:** mensajes `tipo(scope): resumen` (feat/fix/docs/chore/test/refactor…),
  coherentes con los commits de la extensión git.
- **Un comando para todo:** `Makefile` (o scripts npm) envuelve `install` / `test` / `up` / `gate`,
  reforzando "install + test en máquina limpia".
- **Gestor de paquetes:** **npm**.
- **Idioma:** código, identificadores y comentarios en **inglés**; textos de cara al usuario (UI y
  `message` de error) en **español**; el `code` de error es estable en inglés (machine-readable). Un solo
  idioma (i18n fuera de alcance).
- **IDs:** **UUID v7** (ordenables por tiempo) para entidades.
- **Fechas/horas:** **UTC + ISO-8601** en contrato, dominio y persistencia.
- **Paginación:** **por cursor** (no offset) en los listados.
- **Accesibilidad:** UI con objetivo **WCAG 2.1 AA**.
- **Sistema de diseño (transversal):** la UI consume **tokens y componentes** de un design system propio
  (`frontend/src/ui/`, CSS variables), **sin estilos sueltos** (nada de hex/px/font arbitrarios) y **sin
  librería de componentes pesada**; los specs de UI lo **consumen**, no lo redefinen. Artefacto:
  `docs/design-system.md` + `frontend/src/ui/`, se crea al llegar la primera UI.
- **Threat modeling:** las features **sensibles de seguridad** incluyen un **STRIDE** que alimenta
  requisitos y tests (p. ej. 001).
- **Migraciones reversibles / rollback (M10):** cada migración de BD tiene su **reverso**; el despliegue
  contempla un **plan de rollback** (RTO objetivo se detalla en la fase DevOps). No romper datos existentes.

## Refuerzos de robustez y control de flujo

> Refuerzos transversales que concretan principios existentes. Los específicos de feature se
> materializan en su spec.

### MVP vs Stretch (proporcionalidad — "slice pequeño y bien hecho")

Para no exceder el mínimo del brief, los refuerzos se clasifican (auditoría neutral vs brief, docs/07):

- **Obligatorio (MVP de cada feature):** FSM explícito; **auditoría mínima** (cada transición registra
  actor/timestamp/motivo, atómica con la transición); evidencia validada; IA no-inventa + rate-limit;
  seguridad web (helmet/CSRF/rate-limit/config fail-fast); correlation-ID; y **el NFR de rendimiento
  ("rápido") cuantificado obligatoriamente en los Success Criteria de cada spec**.
- **Stretch (opcional por feature; NO bloquea el gate; solo si da tiempo):** idempotency-key;
  concurrencia optimista (If-Match→409); **auditoría forense** (registro de accesos denegados,
  evidencia versionada por intento); procedencia + staleness del resumen de IA.

> **Criterio para clasificar (clave):** ¿afecta a la **base** (schema, contrato, arquitectura), costoso
> de *retrofitear*? → la **decisión de diseño se toma AHORA** en la feature que la posee — p. ej. la
> columna `version` (concurrencia) y la **tabla de auditoría** se definen en el data model de 002,
> **base-ready**, aunque el comportamiento completo (`If-Match→409`, auditoría forense) quede *stretch*.
> Si es **aditivo/localizado** (se puede añadir luego sin reescribir), es *stretch* puro y se mejora más
> adelante. Los principios VIII/X/XI conservan su redacción; su parte *stretch* **no bloquea el gate**.
> **Regla: diseña la base para no reescribirla; difiere lo no esencial.**

**Robustez de dominio**

- **Máquina de estados explícita (III):** una **tabla única de transiciones permitidas**; el dominio
  rechaza **por construcción** toda transición ilegal (no `if` sueltos). → spec 002.
- **Auditoría atómica (XI):** la transición de estado y su registro de auditoría se escriben en la
  **misma transacción**; sin auditoría no hay cambio de estado.
- **Evidencia validada (IX/X):** tipo/tamaño/decodificable **antes** de adjuntar; se rechazan subidas
  corruptas o a medias. → spec 004.

**Robustez del componente IA (VIII)**

- **Procedencia + staleness:** el resumen guarda la **versión de evidencia** con la que se generó y se
  marca **obsoleto** si la evidencia cambia después. → spec 006.
- **Rate-limit** del endpoint de IA (coste/abuso).

**Seguridad web (IV/IX)**

- **Cabeceras de seguridad** (helmet: HSTS/CSP…) + **CSRF** (por la cookie de refresh) +
  **rate-limit/lockout** en login (fuerza bruta).
- **Validación de config al arrancar** (Zod, **fail-fast**: arranca o falla claro).

**Control del flujo (SDD)**

- **Correlation-ID** propagado punta a punta (request→logs→auditoría→IA) — refuerza X/XI.
- **Spec-freeze:** una vez la spec pasa G1, **modificarla re-dispara G1** (la spec es contrato).
- **Catch-rate de gates:** se registran los bloqueantes cazados por fase en `informes/` (mide el valor
  del proceso).
- **Migraciones probadas en CI** sobre BD limpia + seed (garantiza "install+test en limpio").

## Governance

- Esta constitution **prevalece** sobre plantillas, skills y decisiones de implementación. Jerarquía:
  Constitución > plantillas Spec Kit > decisiones de implementación.
- **Enmiendas:** se proponen por escrito, se versionan por **SemVer** (MAJOR: cambios incompatibles;
  MINOR: nuevo principio o guía ampliada; PATCH: aclaraciones) y generan un Sync Impact Report.
- **Enmiendas aisladas (ADR-0004):** una vez iniciadas las specs, toda enmienda a esta constitution (y los
  cambios de **fundación transversal**: roadmap, agentes, plantillas, extensiones) se hace en una
  **rama/tarea dedicada** (p. ej. `chore/foundation-governance`), se **mergea a `main`** y **NUNCA se mezcla
  con una rama de feature**. Los cambios de gran calado no se cuelan en el trabajo de una spec.
- **Excepciones:** una violación requiere justificación explícita **aprobada por alguien distinto de
  quien la introduce y con competencia en el área afectada**, con evidencia en el PR; nunca
  autoaprobación. **Un hallazgo BLOQUEANTE del gate (XIII) y los principios de seguridad (IV, IX, XI)
  NO son excepcionables**: deben resolverse, no sortearse. Las excepciones solo aplican a trade-offs de
  severidad ALTA/MEDIA no relacionados con seguridad.
- **Cumplimiento:** cada PR/revisión verifica los principios aplicables; la complejidad se justifica
  (YAGNI). Los hallazgos de `/speckit-analyze` y del panel adversarial pueden disparar enmiendas.

**Version**: 1.7.1 | **Ratified**: 2026-07-10 | **Last Amended**: 2026-07-11
