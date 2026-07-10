# 01 · Reparto: qué va a Constitution y qué va a Spec/Roadmap

> Este es **nuestro resumen inicial**: cómo repartimos la información del brief según dónde vive en el
> flujo Spec Kit. **Es exactamente lo que el agente `revisor-cinico` debe poner en duda.** Por eso al
> final marcamos de forma explícita las **asunciones que estamos dando por sentadas**.
>
> Regla de reparto:
> - **Constitution** = lo que sería verdad *sin importar qué feature construyas*. Principios, límites, invariantes.
> - **Spec/Roadmap** = comportamiento observable de *esta* feature concreta. FRs, NFRs, edge cases, criterios de aceptación.

---

## A) A CONSTITUTION — principios no negociables + alcance

### Principios

| Principio | De dónde sale |
|---|---|
| **RBAC en doble capa** — el backend rechaza aunque se fuerce la petición; ocultar un botón no es seguridad | *"seguro, manejamos datos de clientes"* |
| **Invariante 401 ≠ 403** — no autenticado vs autenticado sin permiso | requisito técnico del enunciado |
| **Contract-first** — el contrato de API (OpenAPI/tipos) existe antes del código y los tests lo verifican | requisito técnico |
| **Trazabilidad requisito → test** — sin test que lo verifique, un requisito no está "hecho" | requisito técnico |
| **La IA nunca inventa** — sin evidencia/nota suficiente, lo dice y no resume | regla dura del alcance |
| **Definición de "hecho"** — frontend + backend + tests en verde a la vez, en máquina limpia | filosofía del curso |
| **Spec antes que código** — commits separados que demuestran que la spec fue primero | flujo Spec Kit |

### Alcance

- ✅ **Dentro del slice:** reasignación, registro de ejecución con evidencia, aprobación/rechazo, RBAC,
  asistente de IA de resumen.
- ❌ **Fuera del slice (declarado y justificado):** dashboard de métricas de productividad,
  notificaciones push. El PO ya los marcó como *"eso lo vemos"* / *"ya puestos"* → no entran.

---

## B) A SPEC / ROADMAP — comportamiento concreto (redactado en EARS)

**EARS** = *WHEN [condición] THE [sistema] SHALL [acción] [criterio medible/observable]*. Lo usamos
para que ningún FR admita dos interpretaciones válidas.

### FRs candidatos (borrador, se formalizan en `/speckit-specify`)

- **Reasignar:** *WHEN un dispatcher reasigna una orden en un estado reasignable THE sistema SHALL
  cambiar el técnico asignado y registrar quién/cuándo.*
- **Registrar ejecución:** *WHEN un técnico envía la ejecución de su orden con ≥1 foto de evidencia
  válida THE sistema SHALL mover la orden a `pending_review`.*
- **Aprobar/rechazar:** *WHEN un supervisor resuelve una orden en `pending_review` THE sistema SHALL
  moverla a `closed` (aprobada) o devolverla al estado correspondiente (rechazada) con motivo.*
- **Ver órdenes:** *WHEN un usuario consulta sus órdenes THE sistema SHALL devolver solo las que su rol
  puede ver.*
- **RBAC (guarda transversal):** *WHEN un usuario intenta una acción no permitida a su rol THE sistema
  SHALL rechazarla con 403 (401 si no está autenticado).*

### NFRs a CUANTIFICAR (el brief los deja sueltos)

- *"rápido"* → objetivo de latencia (p. ej. P95 < X ms por operación). **[pendiente de número]**
- *"seguro"* → autenticación, autorización en backend, cifrado en tránsito, manejo de datos de cliente. **[pendiente de concreción]**
- *"al menos una foto"* → formato, tamaño máximo, nº mínimo/máximo. **[pendiente de límites]**

### Componente IA como contrato

- **Entrada:** notas del técnico + evidencia de la orden.
- **Salida:** resumen breve de la incidencia.
- **Fallback (regla dura):** si la evidencia/nota es insuficiente → lo declara y **no** inventa resumen.
- **Eval:** golden cases + umbrales (irá en `/evals`).

---

## C) ⚠️ Asunciones que estamos dando por sentadas (target del revisor cínico)

Estas son las decisiones que **damos por correctas sin haberlas validado**. El agente debe atacarlas:

- **AS-01:** "Estado reasignable" = `assigned` e `in_progress`. *(no lo dice el brief)*
- **AS-02:** Enviar ejecución **sin** foto es un error bloqueante (no se permite guardar borrador sin foto).
- **AS-03:** Cada rol ve solo sus propias órdenes; el supervisor ve todas las de `pending_review`.
- **AS-04:** Un rechazo del supervisor devuelve la orden a `in_progress` (no a `assigned` ni `draft`).
- **AS-05:** "Datos de clientes" = hay PII en las órdenes → aplica cifrado/controles, pero **asumimos** que no hace falta cumplimiento regulado formal (GDPR/PCI) para el slice.
- **AS-06:** El resumen de IA es **asíncrono/bajo demanda** del supervisor, no se genera automáticamente en cada transición.
- **AS-07:** "Rápido" es aceptable en P95 < 300 ms para operaciones CRUD; la IA queda fuera de ese SLA.
- **AS-08:** Dashboard y push quedan fuera **sin coste** para el slice (no hay dependencia oculta de ellos).
- **AS-09:** Un solo idioma, sin i18n, para el slice.
- **AS-10:** No hay concurrencia relevante (dos dispatchers reasignando la misma orden a la vez) que debamos resolver en el slice.

> Cada `AS-xx` es una hipótesis, no un hecho. El revisor cínico debe generar una pregunta crítica por
> cada una (y por lo que se nos haya escapado).
