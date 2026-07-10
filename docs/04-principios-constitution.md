# 04 · Principios destilados para la constitution (input de /speckit-constitution)

> Borrador de principios **verificables** que alimentarán la skill `/speckit-constitution`.
> Formato de cada principio: **regla MUST/SHALL + `Verificación:` (cómo se comprueba) + rationale**.
> Origen: reparto (`01`) + decisiones adversariales (`03`) + estándares minados de los ejercicios
> (FieldOps, Módulo 8/10/11) + decisiones del usuario (hexagonal, stack TS/Node, plantillas completas,
> SDD automatizado). Nada aquí es invención: todo tiene precedente en el material del curso.

---

## Identidad y alcance

**Proyecto:** FieldOps — slice de reasignación, ejecución y revisión de órdenes de trabajo.

- ✅ **Dentro:** reasignar orden (dispatcher), iniciar trabajo + registrar ejecución con evidencia
  (technician), aprobar/rechazar (supervisor), RBAC, asistente IA que resume la incidencia.
- ❌ **Fuera (declarado):** creación/alta inicial de órdenes (draft→assigned; se usan datos semilla),
  dashboard de métricas, notificaciones push, i18n.

---

## Principios (verificables)

### I. Spec-Driven, spec-first
Ningún código se escribe sin una spec aprobada. El flujo es
`constitution → specify → clarify → checklist → plan → tasks → analyze → implement`, con **una rama
por spec** y **commits separados** que demuestran que la spec precede al código.
- **Verificación:** el historial de git muestra el commit de spec antes que el de implementación en la
  misma rama; existe rama `NNN-feature` por cada spec.
- **Rationale:** la spec gobierna el código; sin ella, la ambigüedad se paga en integración.

### II. Contract-First con OpenAPI
El contrato **OpenAPI 3.1** se versiona en `contracts/` **antes** de implementar y es la **única
fuente de verdad** compartida por frontend y backend. Tipos y validaciones (Zod) se **derivan** del
contrato. Frontera de nombres: `snake_case` externo ↔ `camelCase` interno.
- **Verificación:** no existe commit de un endpoint sin commit previo de su contrato en la misma rama;
  `openapi-typescript` genera los tipos y el build falla ante divergencia; contract tests al 100%.
- **Rationale:** los breaking changes salen en compilación, no en producción.

### III. Arquitectura Hexagonal (puertos y adaptadores)
Tres capas: **Dominio** (lógica pura, sin infraestructura) · **Handlers/Aplicación** (orquestación
HTTP) · **Infraestructura** (DB, externos, IA). El dominio recibe dependencias por inyección (puertos)
y se testea **sin mocks de infraestructura**.
- **Verificación:** los ficheros de `domain/` no importan Express/Prisma/SDK-IA (test de arquitectura
  por grep/lint); los tests de dominio corren sin BD.
- **Rationale:** DIP y SRP; dominio aislado, testeable y estable frente a cambios de infraestructura.

### IV. RBAC en doble capa y mínimo privilegio
La autorización vive en el **backend** y rechaza aunque se fuerce la petición (ocultar un botón no es
seguridad). Se distingue **401** (no autenticado), **403** (autenticado sin permiso) y **404** (recurso
ajeno, para no filtrar existencia). Cada acción valida rol **y** pertenencia (`assigned_to == usuario`).
La política de visibilidad es **centralizada e inyectable** (matriz rol×alcance), mínimo privilegio por
defecto; hoy organización única, extensible a equipos sin reescribir.
- **Verificación:** test negativo por endpoint y rol no autorizado a nivel de API (no solo UI); tests
  de la matriz rol×alcance; test de acceso a recurso ajeno devuelve 404.
- **Rationale:** el peor actor fuerza la API directamente; OCP para el aislamiento futuro.

### V. Requisitos en EARS, sin ambigüedad
Todo FR se redacta en **EARS**: *WHEN [condición] THE [sistema] SHALL [acción] [resultado medible]*.
Cumple el **test de la pregunta cero**: otro ingeniero puede implementarlo sin preguntar.
- **Verificación:** el panel adversarial (auditor-spec-theater) no reporta enunciados que fallen el
  test EARS / 2-implementaciones / pass-fail; 0 términos sin cuantificar.
- **Rationale:** si un texto admite ≥2 implementaciones válidas, es teatro, no especificación.

### VI. Trazabilidad RF → endpoint → tarea → test
Cada requisito se mapea a al menos un endpoint, una tarea y un test nombrable. Si no se puede nombrar
su test, el requisito no es suficientemente preciso ni está "hecho".
- **Verificación:** `docs/traceability.md` con la matriz completa; cada FR tiene ≥1 test asociado.
- **Rationale:** un requisito no verificable no está terminado.

### VII. TDD con fase Red obligatoria
Los tests se escriben y fallan (Red) antes de implementar. La integración usa **BD real** (contenedor
o SQLite de test), nunca mocks del ORM; mocks solo para terceros/reloj/aleatoriedad. Cobertura
objetivo: **≥80% en dominio/servicios** y **100% de contratos** y transiciones de estado.
- **Verificación:** CI ejecuta unit + contract + integration en verde; informe de cobertura cumple umbrales.
- **Rationale:** el test primero fuerza diseño y evita regresiones.

### VIII. La IA nunca inventa (anclada a eval)
El asistente de resumen **declara "evidencia insuficiente" y no inventa** cuando hay 0 fotos válidas o
notas < 20 caracteres. Debe citar la evidencia por afirmación y operar a temperatura baja. Se
especifica como **contrato** (entradas/salida/fallback) y se valida con una **eval**.
- **Verificación:** eval en `/evals` con golden cases; umbrales `faithfulness ≥ 0.90`,
  `tasa_alucinacion ≤ 0.05`; el gate de eval bloquea si no se cumplen.
- **Rationale:** un resumen inventado sobre datos de cliente es un riesgo mayor que no resumir.

### IX. Seguridad de datos y PII
TLS 1.2+ obligatorio; **cifrado en reposo** de PII y fotos; acceso a evidencia tras autorización
por-orden (URLs firmadas caducas); **redacción de PII en logs**; política de retención declarada.
Inventario explícito de campos PII (cliente, fotos con rostros/matrículas, ubicación).
- **Verificación:** test de que las fotos no son accesibles por URL directa sin autorización; grep de
  que los logs no emiten campos PII; documento de inventario PII + retención.
- **Rationale:** manejamos datos de clientes; una fuga es el peor fallo posible.

### X. Robustez operacional: errores accionables, idempotencia, concurrencia, observabilidad
Contrato de errores `{ code, message, details, agent_action }` con HTTP correcto (404/409/410/422/503).
Operaciones que cambian estado son **idempotentes**; la concurrencia se controla con **versión
(If-Match → 409)**. Logging estructurado (pino) con `requestId/actorId/entityId/action`; `/health` y
`/ready`.
- **Verificación:** contract tests de errores por código; test de doble-envío (idempotencia); test de
  edición concurrente devuelve 409; endpoints de salud responden.
- **Rationale:** el sistema debe fallar de forma predecible y depurable.

### XI. Auditoría append-only
Cada transición de estado registra actor, timestamp, acción y motivo, de forma **inmutable**. La
evidencia (fotos/notas) se **conserva versionada por intento** con su autor tras reasignar/rechazar.
- **Verificación:** test de que una transición crea un registro de auditoría inmutable; test de que la
  evidencia previa persiste tras reasignación/rechazo.
- **Rationale:** trazabilidad legal y resolución de disputas.

### XII. Simplicidad, SOLID y límites de código
YAGNI: no se abstrae por futuros hipotéticos. `strict: true` sin `any` injustificado (con comentario
`// JUSTIFICACIÓN:`). Funciones ≤ 50 líneas, ficheros ≤ 300, solo named exports.
- **Verificación:** lint/CI comprueba límites y `any`; revisión de diseño SOLID.
- **Rationale:** el slice es pequeño y bien hecho; la complejidad accidental es deuda.

### XIII. Gates de revisión adversarial automatizados
El **panel de 3 agentes** (revisor-cinico, auditor-spec-theater, revisor-rbac-seguridad) se ejecuta
como gate **tras `clarify`**, **tras `analyze`** y **tras `implement` + tests funcionales**. Criterio de
avance: **0 hallazgos BLOQUEANTES** (no exigimos 0 hallazgos).
- **Verificación:** existe informe de gate por fase; el pipeline no avanza con bloqueantes abiertos.
- **Rationale:** poner en duda lo dado por sentado en cada punto reduce ambigüedad y caza errores de
  planteamiento e implementación.

---

## Stack tecnológico (estándar del proyecto)

| Capa | Tecnología |
|---|---|
| Runtime / Lenguaje | Node.js 18+ · TypeScript 5 (strict) |
| Backend | Express 4 · arquitectura hexagonal |
| Validación | Zod (derivado del contrato) |
| Contrato | OpenAPI 3.1 (`contracts/`) |
| ORM / BD | Prisma · SQLite (dev/test) → PostgreSQL (prod) |
| Frontend | React 18 + Vite (mínimo, consumiendo el contrato) |
| Tests | Vitest (unit) · Supertest (integración/contrato) |
| IA | SDK del proveedor tras un puerto de dominio + eval en `/evals` |
| Logging | pino (estructurado) |
| Empaquetado | npm scripts: un comando `install`, un comando `test` |

> Elección de stack: el brief no fija tecnología; se adopta TS/Node por ser el más común y el mejor
> integrado con Claude y Spec Kit.

---

## Gobernanza (resumen; el detalle de automatización va en `05`)

- **Una rama por spec** (`NNN-feature`), commits separados spec→código.
- **Gates adversariales** tras clarify, analyze e implement+tests (Principio XIII).
- **Versionado** de la constitution por SemVer con Sync Impact Report (lo gestiona la skill).
- **Jerarquía:** Constitución > plantillas Spec Kit > decisiones de implementación.
