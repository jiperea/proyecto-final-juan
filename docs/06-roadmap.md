# 06 · Roadmap de specs (features)

> Descomposición del alcance en **features**, cada una destinada a **su propia spec y su propia rama**
> (`NNN-feature`, creada por la extensión git). No se redactan las specs aquí (eso es la fase
> siguiente); esto fija **qué specs hay, en qué orden y con qué dependencias**.

## Principio de descomposición

Cada feature es un incremento **verticalmente testeable** (contrato + dominio + tests) y lo bastante
pequeño para pasar los tres gates. La fundación se **divide en dos** (auth/RBAC y dominio Order) para
mantener slices pequeños e independientemente testeables; el resto construye encima.

## Features

| # | Rama | Feature | Depende de | Cubre (alcance §Constitution) |
|---|---|---|---|---|
| 001 | `001-fundacion-auth-rbac` | **Fundación A**: auth (JWT access+refresh/argon2id) + ciclo de sesión + **matriz RBAC rol×alcance** + contrato de errores + observabilidad | — | Func. #4, Principios IV, X |
| 002 | `002-fundacion-order-core` | **Fundación B**: entidad `Order` + **máquina de estados** + **auditoría append-only** + **datos semilla** (POV) | 001 | Principios XI + estados |
| 003 | `003-reasignacion-orden` | **Reasignación** por el dispatcher (estados reasignables, evidencia versionada, concurrencia If-Match→409) | 001, 002 | Func. #1 |
| 004 | `004-registro-ejecucion` | **Iniciar trabajo** (assigned→in_progress) + **registrar ejecución** con evidencia (≥1 foto válida) → pending_review | 001, 002 | Func. #2 |
| 005 | `005-revision-supervisor` | **Aprobar/rechazar** en pending_review (rechazo→in_progress con motivo; evidencia conservada) | 001, 002, 004 | Func. #3 |
| 006 | `006-resumen-incidencia-ia` | **Asistente IA** que resume la incidencia (contrato IA, fallback "no inventa", minimización de PII) + **eval** en `/evals` | 002, 004, 005 | Func. #5, Principio VIII |

## Orden y paralelismo

```
001 (auth+RBAC) ──► 002 (Order core)
                        ├── 003 (reasignación)
                        └── 004 (ejecución) ──► 005 (revisión) ──► 006 (resumen IA)
```

- **001 → 002** primero (todo depende del auth/RBAC y del dominio Order + estados).
- **003** puede ir en paralelo a **004** una vez cerrada 002.
- **005** requiere 004 (necesita órdenes en `pending_review`).
- **006** al final (consume notas/evidencia de 004 y lo lee el supervisor de 005).

## Cada feature, al entrar, dispara el flujo con gates

`/speckit-specify` (crea rama) → `/speckit-clarify` → **G1** → `/speckit-checklist` → `/speckit-plan`
→ `/speckit-tasks` → `/speckit-analyze` → **G2** → `/speckit-implement` + tests → **G3** → merge.

## Refuerzos por feature (MVP vs Stretch — constitution v1.5.0)

**MVP (obligatorio):**
- **001** (auth+RBAC): visibilidad por rol (technician ve **sus órdenes asignadas**, dispatcher las
  reasignables, supervisor las de `pending_review`) + seguridad web (helmet/CSRF/rate-limit/config fail-fast).
- **002** (Order core): **FSM explícito** (tabla de transiciones) + **auditoría mínima** (transición:
  actor/timestamp/motivo, atómica) + **listado de órdenes** (cubre "ver sus órdenes" del brief).
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
