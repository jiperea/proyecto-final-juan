# 06 · Roadmap de specs (features)

> Descomposición del alcance en **features**, cada una destinada a **su propia spec y su propia rama**
> (`NNN-feature`, creada por la extensión git). No se redactan las specs aquí (eso es la fase
> siguiente); esto fija **qué specs hay, en qué orden y con qué dependencias**.

## Principio de descomposición (Constitution XV — specs pequeñas)

Cada feature es un incremento **verticalmente testeable** (contrato + dominio + tests), **pequeño,
demostrable e independiente**, y lo bastante acotado para pasar los tres gates sin turbulencia. El
**cluster complejo/de robustez se aísla** en una spec posterior en vez de meterlo todo en una
(**Principio XV**). El dimensionado es una decisión **de origen** (aquí y en `/speckit-specify`).

> **Señal de "demasiado grande"** (XV): si en `/speckit-clarify` o en los gates una feature genera
> muchísimos hallazgos o un `tasks.md` desproporcionado, debió partirse. **Chequeo de tamaño obligatorio
> al entrar cada feature** (antes de `/speckit-specify`).

### Retro de 001 (grandfathered)

**001 quedó sobredimensionada** (~10 rondas de gate, 66 tareas): metió en una sola feature el cluster
complejo (rotación single-use + familias + gracia + reuso/FR-004b + CSRF double-submit + caché de
revocación). Por la **regla de no-rollback** (XV), **no se re-parte**: se **implementa por user story**
como 3 sub-incrementos demostrables:

| Sub | User story | Contenido | Demostrable |
|-----|-----------|-----------|-------------|
| 001·A | US1 (MVP) | login · logout · `me` · lockout · config fail-fast · cabeceras · correlation-id · /health-ready | "entro, sé quién soy, salgo" |
| 001·B | US3 | RBAC 401/403/404 + `rbacProbe` (regla determinista) | "el RBAC rechaza correctamente" |
| 001·C | US2 | refresh rotación single-use + familias + gracia + reuso + CSRF | "sesión robusta y renovable" |

**Si 001 se hubiera dimensionado hoy** habría sido 001a (A+B) y 001b (C). Lección aplicada a las siguientes.

### Chequeo de tamaño XV aplicado a 002–006 (2026-07-11, tras cerrar 001)

Revisado el resto del roadmap con el Principio XV y la lección de 001:

- **002 (Order core) — SOBREDIMENSIONADA** (repite el patrón de 001: junta el read-side con el cluster de
  robustez estado+auditoría). **Se parte de origen** en **002a** (entidad + seed + listado) y **002b**
  (FSM + auditoría append-only). Es una decisión **de origen**, no un rollback (no está iniciada).
- **003 / 005 / 006 — OK**: foco único (una acción/componente). No se parten.
- **004 (ejecución) — límite**: 2 transiciones + evidencia. **No se parte** (partir "iniciar trabajo"
  assigned→in_progress sería una micro-feature); se **vigila la evidencia** como punto de riesgo y, si en
  clarify/gates genera turbulencia, se aísla la gestión de evidencia en una spec propia.

## Features

| # | Rama | Feature | Depende de | Cubre (alcance §Constitution) |
|---|---|---|---|---|
| 001 | `001-fundacion-auth-rbac` | **Fundación A**: auth (JWT access+refresh/argon2id) + ciclo de sesión + **matriz RBAC rol×alcance** + contrato de errores + observabilidad ✅ **G3 APROBADA** | — | Func. #4, Principios IV, X |
| 002a | `002a-order-entity-listado` | **Fundación B-1** (read-side): entidad `Order` + **datos semilla** + **listado por rol** ("ver mis órdenes") sobre el RBAC de 001 | 001 | Func. "ver órdenes", Principio XI |
| 002b | `002b-order-fsm-auditoria` | **Fundación B-2** (write-side): **máquina de estados** explícita (tabla de transiciones) + **auditoría append-only** de transiciones (actor/timestamp/motivo, atómica) | 001, 002a | Principios XI + estados |
| 003 | `003-reasignacion-orden` | **Reasignación** por el dispatcher (estados reasignables; concurrencia If-Match→409 *stretch*) | 001, 002b | Func. #1 |
| 004 | `004-registro-ejecucion` | **Iniciar trabajo** (assigned→in_progress) + **registrar ejecución** con evidencia (≥1 foto válida) → pending_review | 001, 002b | Func. #2 |
| 005 | `005-revision-supervisor` | **Aprobar/rechazar** en pending_review (rechazo→in_progress con motivo; evidencia conservada) | 001, 002b, 004 | Func. #3 |
| 006 | `006-resumen-incidencia-ia` | **Asistente IA** que resume la incidencia (contrato IA, fallback "no inventa", minimización de PII) + **eval** en `/evals` | 002a, 004, 005 | Func. #5, Principio VIII |
| 007 | `NNN-evidencia-subida` | **Gestión de evidencia (subida binaria)** — carve-out de #004 (XV): subida real de la foto (multipart), almacenamiento de objetos, **URLs firmadas ≤300 s**, minimización de PII del binario. Materializa el *transporte* de "adjuntar ≥1 foto" que #004 valida **por referencia**. **BL-068.** | 004 | Func. #2 (transporte de evidencia) |
| 008 | `NNN-endurecimiento-write-side` | **Endurecimiento write-side (robustez)** — carve-out de #003/#004/#005 (XV): concurrencia optimista `If-Match`→409; paridad de latencia/cabeceras del 404 y del 422; mapeo fino de errores de BD (503 vs 500). **BL-001/061/062/063/064/066.** | 003/004/005 | "rápido/seguro"; Princ. IV |
| 009 | `NNN-auditoria-accesos-denegados` | **Auditoría forense de accesos denegados** (401/403/404: actor/endpoint/recurso) — reconcilia la tensión de gobernanza de Constitution XI. **BL-002/067.** | 001/002b | Principio XI (ampliado) |

> **Regla de atomización (XV)**: todo cluster que se **saca** de una feature para no sobredimensionarla se
> registra **aquí como feature propia** (#007–#009, no sólo en backlog) y se **lanza cuando toque** — nunca se
> deja como scope difuso/olvidado (lección de #003/#004). Trazan al brief: #007 = "foto de evidencia" (Func #2);
> #008 = "rápido y seguro"; #009 = Principio XI. **No** amplían el alcance del brief; sólo lo completan/endurecen.

> Nota de numeración: `002a`/`002b` son dos features (spec + rama + gates propios). El número secuencial físico
> (`NNN-…`) lo asigna la extensión git al lanzar `/speckit-specify`; aquí fijan alcance y orden lógico. Físicos
> ya asignados: 003 (roadmap #003 reasignación = rama `004-orden-reasignacion`), #004 ejecución = `005-…`.

## Orden y paralelismo

```
001 (auth+RBAC) ──► 002a (Order+listado) ──► 002b (FSM+auditoría)
                                                  ├── 003 (reasignación)
                                                  └── 004 (ejecución) ──► 005 (revisión) ──► 006 (resumen IA)
```

- **001 → 002a → 002b** primero (todo depende del auth/RBAC, luego de la entidad Order y de la FSM+auditoría).
- **002a** (read-side) es demostrable por sí sola ("veo mis órdenes por rol"); **002b** añade las transiciones.
- **003** puede ir en paralelo a **004** una vez cerrada **002b** (ambas hacen transiciones de estado).
- **005** requiere 004 (necesita órdenes en `pending_review`).
- **006** al final (consume notas/evidencia de 004 y lo lee el supervisor de 005).
- **Carve-outs (XV)**, se lanzan **cuando toque** (no antes, para no sobredimensionar): **#007** (subida de
  evidencia) tras #004, antes de considerar "registro de ejecución" cerrado de cara al usuario final; **#008**
  (endurecimiento write-side) cuando el MVP funcional esté completo (endurece 003/004/005); **#009** (auditoría
  de accesos denegados) a nivel de fundación/gobernanza. Ninguno bloquea el MVP funcional del brief.

## Cada feature, al entrar, dispara el flujo con gates

`/speckit-specify` (crea rama) → `/speckit-clarify` → **G1** → `/speckit-checklist` → `/speckit-plan`
→ `/speckit-tasks` → `/speckit-analyze` → **G2** → `/speckit-implement` + tests → **G3** → merge.

## Refuerzos por feature (MVP vs Stretch — constitution v1.5.0)

**MVP (obligatorio):**
- **001** (auth+RBAC): visibilidad por rol (technician ve **sus órdenes asignadas**, dispatcher las
  reasignables, supervisor las de `pending_review`) + seguridad web (helmet/CSRF/rate-limit/config fail-fast).
- **002a** (Order read-side): **listado de órdenes por rol** (cubre "ver sus órdenes" del brief) + seed.
- **002b** (Order write-side): **FSM explícito** (tabla de transiciones) + **auditoría mínima** (transición:
  actor/timestamp/motivo, atómica).
- **004** (ejecución): evidencia **validada** antes de adjuntar.
- **006** (IA): no-inventar + **rate-limit** del endpoint.
- **Transversal:** correlation-ID; NFR "rápido" **cuantificado en los SC** de cada spec.

**Stretch (opcional; no bloquea gate; solo si da tiempo):**
- idempotency-key + concurrencia optimista (If-Match→409) — en 003/004.
- auditoría **forense** (accesos denegados, evidencia versionada por intento) — en 002/004.
- resumen IA con **procedencia + staleness** — en 006.

## Fuera de alcance (declarado)

Creación/alta inicial de órdenes (draft→assigned; datos semilla), multi-tenant, dashboard de métricas,
notificaciones push, i18n.
