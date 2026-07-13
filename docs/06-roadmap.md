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
| 007 | `NNN-evidencia-subida` | **Gestión de evidencia (subida binaria)** — carve-out de #004 (XV): subida real de la foto (multipart), almacenamiento de objetos, **URLs firmadas ≤300 s**, minimización de PII del binario (incl. at-rest de `OrderEvidence.object_ref`). Materializa el *transporte* de "adjuntar ≥1 foto" que #004 valida **por referencia**. **BL-068.** | 004 | Func. #2 (transporte de evidencia) |
| 008 | `NNN-endurecimiento-write-side` | **Endurecimiento write-side (robustez)** — carve-out de #003/#004/#005 (XV): concurrencia optimista `If-Match`→409; paridad de latencia/cabeceras del 404 y del 422; mapeo fino de errores de BD (503 vs 500). **BL-001/061/062/063/064/066.** | 003/004/005 | "rápido/seguro"; Princ. IV |
| 009 | `NNN-auditoria-accesos-denegados` | **Auditoría forense de accesos denegados** (401/403/404: actor/endpoint/recurso) — reconcilia la tensión de gobernanza de Constitution XI. **BL-002/067.** | 001/002b | Principio XI (ampliado) |

> **Deuda trazada de 005 (registro-ejecución)**: **BL-069** — cifrado en reposo + purga/retención de
> `OrderExecutionNotes.notes` (Constitution IX; distinto de BL-051/055, que son de `OrderAudit.reason`). La
> **separación estructural** (notas fuera de la auditoría, XI) se hace **ya** en 005; el cifrado/purga
> automatizada se difiere a BL-069 (obligatorio antes del merge, sin vía de escape). El at-rest de
> `OrderEvidence.object_ref` es **#007** (BL-068), no BL-069.

> **Deuda documental de 006 (write-side invariant)**: **BL-071** — reconciliar la redacción de **003 FR-006**
> ("único punto de escritura de estado = función `applyTransition`") con el diseño real: 005 y 006 escriben
> `status`/`version` desde su **propio módulo** en `domain/order/write-side/*` (+ `order-write-side-repository.ts`)
> sin `applyTransition`. El invariante efectivo (verificado por arch test en 005/006) es **"carpeta única
> write-side"**. No bloqueante; afecta a #008 (la concurrencia `If-Match`/409 deberá reforzarse en cada ruta
> write-side, no sólo en `applyTransition`). Detectado en el gate G2 de 006.

> **Regla de atomización (XV)**: todo cluster que se **saca** de una feature para no sobredimensionarla se
> registra **aquí como feature propia** (#007–#009, no sólo en backlog) y se **lanza cuando toque** — nunca se
> deja como scope difuso/olvidado (lección de #003/#004). Trazan al brief: #007 = "foto de evidencia" (Func #2);
> #008 = "rápido y seguro"; #009 = Principio XI. **No** amplían el alcance del brief; sólo lo completan/endurecen.

> Nota de numeración: la columna **Rama** muestra el *slug lógico* del roadmap; el número secuencial **físico**
> (`NNN-…`) lo asigna la extensión git al lanzar `/speckit-specify` y **va desfasado +1** desde la reasignación.
> Equivalencias físicas ya asignadas: roadmap #002a = `002-order-entity-listado`; #002b = `003-order-fsm-audit`;
> #003 reasignación = `004-orden-reasignacion`; #004 ejecución = `005-registro-ejecucion`; **#005 revisión =
> `006-revision-supervisor`**; #006 IA → previsiblemente `007-…`. (`002a`/`002b` son dos features con spec + rama
> + gates propios.)

## Fase Front (FE) — completa el "front+back juntos" del enunciado

> El **enunciado del curso** define "hecho" como *frontend + backend + tests en verde a la vez*. El brief de
> negocio no menciona UI pero la **implica** (técnico en campo con foto, dispatcher, supervisor). Las features
> 001–009 se construyeron **API-first**; el front se planifica ahora como slices que **consumen los contratos ya
> congelados** (`contracts/*.openapi.yaml`) — no es retrabajo, el contrato es la costura. App **responsive**:
> móvil para el técnico en campo, escritorio *master-detail* para dispatcher/supervisor.

| # | Rama | Feature | Depende de | Demostrable |
|---|---|---|---|---|
| FE-1 | `NNN-front-shell-listado` | **Shell + acceso + listado (read-only)**: app responsive (React 18 + Vite, design system), login/sesión, "mis órdenes" por rol, detalle solo-lectura | 001, 002a | "entro, veo mis órdenes por rol, abro una" |
| FE-2 | `NNN-front-tecnico` | **Front del técnico (campo/móvil)**: iniciar trabajo + registrar ejecución + captura de evidencia | FE-1, 004 (subida binaria real → #007) | "registro la ejecución con ≥1 foto y la envío a revisión" |
| FE-3 | `NNN-front-dispatcher` | **Front del dispatcher (escritorio)**: reasignación en master-detail | FE-1, 003 | "reasigno una orden reasignable a otro técnico" |
| FE-4 | `NNN-front-supervisor` | **Front del supervisor (escritorio)**: aprobar/rechazar + panel de resumen IA | FE-1, revisión (005), 006 | "reviso, veo el resumen y apruebo/rechazo con motivo" |

> **Sistema de diseño (UX/UI) — se define justo antes de FE-1**, no por adelantado: tokens/paleta, tipografía,
> componentes base, patrón responsive campo↔oficina, accesibilidad **WCAG 2.1 AA** (Constitution, Convenciones).
> Referencia de partida: exploración de vistas mínimas (login · lista · detalle por rol · registro de ejecución
> con evidencia; móvil + escritorio master-detail).
>
> **Deuda trazada → feature #010 — Detalle de orden (read-side, prerequisito de FE-1/FE-4)**: las specs 004–006
> son *write-side* y **no** exponen la lectura del detalle (notas de ejecución + metadatos de evidencia + motivo
> del rechazo). El "detalle solo-lectura" de FE-1 necesita un **backend read-side** que la sirva. Detectado como
> BLOQUEANTE en el **gate G1 de 006** y resuelto difiriéndolo aquí (Constitution XV: 006 no se sobredimensiona).
> **Dueño y secuencia**: feature **#010 `NNN-order-detalle-read`**, depende de 002a/005/006, se lanza **antes de
> FE-1** (bloquea FE-1/FE-2/FE-4). **Precondición dura**: **enmienda de Constitution XI** para que el
> **technician** pueda leer el motivo de *su propio* rechazo (`OrderAudit.reason`; hoy la lectura de auditoría se
> restringe a supervisor/auditor) — la enmienda se aplica **al entrar en #010**, no antes. Sin #010, el ciclo de
> calidad del brief (el técnico corrige tras el rechazo) es inoperable para el usuario final aunque 006 pase sus
> gates. **BL-070.**

## Fase DevOps (DO) — transversal (ADR-0004) · Reto M12

> **Spec antes que YAML** (regla del reto y del programa): el historial de git debe demostrar que la spec del
> pipeline es anterior al primer `.yml`. Transversal → **rama/tarea dedicada** (no de feature), como
> constitución/fundación (ADR-0004). Estrategia de ramas del reto: `feature/*` → `develop` → `main`. Flujos
> **separados por componente** con filtros `paths:` (un cambio solo en `backend/` no dispara los de front).

| # | Entregable | Capa | Depende de |
|---|---|---|---|
| DO-1 | **`pipeline-constitution.md` + `pipeline-spec.md`** (FRs EARS, NFR CI < 10 min, ACs); commit **anterior** a cualquier `.yml` | Mínima | — |
| DO-2 | **Contenerización**: Dockerfile del backend (multi-stage) + `docker-compose` que orquesta **db (Postgres) · back · front** para dev y paridad dev=prod; prerequisito de imagen/Trivy/GHCR. El servicio `front` queda declarado pero **inerte hasta FE-1** | Mínima | — (front: FE-1) |
| DO-3 | **`pr-validation-back.yml`**: gates M9 (lint/test · Spectral · oasdiff · gitleaks · acceptance-check · **Trivy**) + **guardián de Constitución** → bloquea el merge | Mínima | DO-1, DO-2 |
| DO-4 | **`ci-develop-back.yml`**: CI + imagen `x.y.z-snapshot.{sha}` → GHCR + dist (`upload-artifact`, 90 d) | Mínima | DO-3 |
| DO-5 | **`ci-main-back.yml`**: CI + imagen `x.y.z` (tag semver) + GitHub Release con dist | Mínima | DO-4 |
| DO-6 | **Workflows de front** (`pr-validation-front` · `ci-develop-front` · `ci-main-front`) | Mínima\* | FE-1 |
| DO-7 | **CD**: dev (develop, auto) · pre (main, auto) · prod (main, **aprobación manual** vía GitHub Environment) | Opcional | DO-4/5 + target cloud |

> \* Los workflows de front son obligatorios en el reto pero **inertes hasta que exista `frontend/`** → dependen de FE-1.
>
> **No rebuild en CD** (no negociable, va en `pipeline-constitution.md`): la imagen que pasó CI en GHCR es la que
> se despliega; nunca se reconstruye desde el fuente.
>
> **Decisiones abiertas, a resolver en DO-1**: (a) adoptar `develop`/`main` vs conservar `rama-por-spec`
> (ADR-0004); (b) `pipeline-constitution.md` separado vs principio en `constitution.md` **+** fichero; (c) target
> de CD → recomendado **PaaS que consume la imagen de GHCR + Postgres gestionada** (Render/Railway/Fly.io), sin
> OIDC/Azure. El gate de aprobación a prod (Environment + reviewer) topa con el muro de **repo privado Free** (M9 J2).

## Enmiendas de constitución (progresivas)

Las enmiendas se aplican **al entrar en cada fase, no por adelantado**:

- **Antes de FE-1**: definir el sistema de diseño/UX-UI y **reconciliar la "definición de hecho"** (front+back a
  la vez) con el modo API-first ya seguido en 001–009.
- **Antes de DO-1**: añadir la gobernanza del pipeline (spec-as-gate, pin por SHA, permisos mínimos, no rebuild en
  CD, flujos separados por componente) — como principio nuevo en `constitution.md` y/o `pipeline-constitution.md`.

## Orden y paralelismo

```
DO-1 (spec pipeline) ──► DO-2 (contenerización) ──► DO-3 (PR-gate back) ──► DO-4 (CI develop) ──► DO-5 (CI main) ──► DO-7 (CD, opc.)
   │  (transversal, antes de cualquier .yml)                                                       ▲
   ▼                                                                                                │
001 (auth+RBAC) ──► 002a (Order+listado) ──► 002b (FSM+auditoría)                                   │
   │                     │                       ├── 003 (reasignación)                             │
   │                     │                       └── 004 (ejecución) ──► 005 (revisión) ──► 006 (IA)│
   ▼                     ▼                                                                          │
FE-1 (shell+listado) ──► FE-2 (técnico)  [dep 004/#007]                                             │
                    ├──► FE-3 (dispatcher) [dep 003]                       DO-6 (workflows front) ───┘
                    └──► FE-4 (supervisor) [dep 005, 006]                    [inerte hasta FE-1]
```

### Backend (API-first)
- **001 → 002a → 002b** primero (todo depende del auth/RBAC, luego de la entidad Order y de la FSM+auditoría).
- **002a** (read-side) es demostrable por sí sola ("veo mis órdenes por rol"); **002b** añade las transiciones.
- **003** puede ir en paralelo a **004** una vez cerrada **002b** (ambas hacen transiciones de estado).
- **005** requiere 004 (necesita órdenes en `pending_review`).
- **006** al final (consume notas/evidencia de 004 y lo lee el supervisor de 005).
- **Carve-outs (XV)**, se lanzan **cuando toque** (no antes, para no sobredimensionar): **#007** (subida de
  evidencia) tras #004, antes de considerar "registro de ejecución" cerrado de cara al usuario final; **#008**
  (endurecimiento write-side) cuando el MVP funcional esté completo (endurece 003/004/005); **#009** (auditoría
  de accesos denegados) a nivel de fundación/gobernanza. Ninguno bloquea el MVP funcional del brief.

### Front (consume contratos congelados)
- **FE-1** entra en cuanto están 001 + 002a (shell + login + listado por rol read-only); es la base de FE-2/3/4.
- **FE-2/FE-3/FE-4** van **en paralelo** sobre FE-1, cada una tras su feature de backend (FE-2→004/#007,
  FE-3→003, FE-4→005+006). El **sistema de diseño se define justo antes de FE-1** (no por adelantado).

### DevOps (transversal, ADR-0004)
- **DO-1 primero de todo lo de pipeline**: la spec del pipeline debe ser **anterior** al primer `.yml` (git lo
  demuestra). No bloquea el backend/front, pero **sí** precede a DO-2..7.
- **DO-2 → DO-3 → DO-4 → DO-5** en cadena (contenerización → PR-gate → CI develop → CI main).
- **DO-6** (workflows de front) queda **inerte hasta FE-1** (no existe `frontend/` antes). **DO-7** (CD) es
  opcional y depende de DO-4/5 + un target cloud.

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
- **Front (FE-1..4):** exigido por la "definición de hecho" del enunciado (front+back+tests en verde a la
  vez); responsive, RBAC en UI espejo del backend, accesibilidad **WCAG 2.1 AA**.
- **DevOps (DO-1..5):** "Mínima" del reto M12 — spec-antes-que-YAML, contenerización, PR-gate con guardián de
  Constitución, CI develop/main con imágenes en GHCR. **DO-6** (workflows front) obligatorio pero inerte hasta FE-1.
- **Transversal:** correlation-ID; NFR "rápido" **cuantificado en los SC** de cada spec.

**Stretch (opcional; no bloquea gate; solo si da tiempo):**

- idempotency-key + concurrencia optimista (If-Match→409) — en 003/004.
- auditoría **forense** (accesos denegados, evidencia versionada por intento) — en 002/004.
- resumen IA con **procedencia + staleness** — en 006.
- **DO-7 (CD)**: dev/pre auto + prod con aprobación manual (topa con el muro de repo privado Free, M9 J2).

## Fuera de alcance (declarado)

Creación/alta inicial de órdenes (draft→assigned; datos semilla), multi-tenant, dashboard de métricas,
notificaciones push, i18n.
