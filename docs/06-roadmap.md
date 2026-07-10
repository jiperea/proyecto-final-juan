# 06 · Roadmap de specs (features)

> Descomposición del alcance en **features**, cada una destinada a **su propia spec y su propia rama**
> (`NNN-feature`, creada por la extensión git). No se redactan las specs aquí (eso es la fase
> siguiente); esto fija **qué specs hay, en qué orden y con qué dependencias**.

## Principio de descomposición

Cada feature es un incremento **verticalmente testeable** (contrato + dominio + tests) y lo bastante
pequeño para pasar los tres gates. La feature fundacional establece lo transversal (auth/RBAC, entidad
`Order` + máquina de estados, auditoría, contrato de errores, observabilidad, datos semilla); el resto
construye encima.

## Features

| # | Rama | Feature | Depende de | Cubre (alcance §Constitution) |
|---|---|---|---|---|
| 001 | `001-fundacion-auth-rbac` | **Fundación**: auth + sesión, matriz RBAC rol×alcance, entidad `Order` + máquina de estados, auditoría append-only, contrato de errores, observabilidad, **datos semilla** | — | RBAC (func. #4), Principios IV, X, XI + estados |
| 002 | `002-reasignacion-orden` | **Reasignación** por el dispatcher (estados reasignables, evidencia versionada, concurrencia If-Match→409) | 001 | Func. #1 |
| 003 | `003-registro-ejecucion` | **Iniciar trabajo** (assigned→in_progress) + **registrar ejecución** con evidencia (≥1 foto válida) → pending_review | 001 | Func. #2 |
| 004 | `004-revision-supervisor` | **Aprobar/rechazar** en pending_review (rechazo→in_progress con motivo; evidencia conservada) | 001, 003 | Func. #3 |
| 005 | `005-resumen-incidencia-ia` | **Asistente IA** que resume la incidencia (contrato IA, fallback "no inventa", minimización de PII) + **eval** en `/evals` | 001, 003, 004 | Func. #5, Principio VIII |

## Orden y paralelismo

```
001 (fundación)
      ├── 002 (reasignación)
      └── 003 (ejecución) ──► 004 (revisión) ──► 005 (resumen IA)
```

- **001 primero** (todo depende de ella). 
- **002** puede ir en paralelo a 003 una vez cerrada 001.
- **004** requiere 003 (necesita órdenes en `pending_review`).
- **005** al final (consume notas/evidencia de 003 y lo lee el supervisor de 004).

## Cada feature, al entrar, dispara el flujo con gates

`/speckit-specify` (crea rama) → `/speckit-clarify` → **G1** → `/speckit-checklist` → `/speckit-plan`
→ `/speckit-tasks` → `/speckit-analyze` → **G2** → `/speckit-implement` + tests → **G3** → merge.

## Fuera de alcance (declarado)

Creación/alta inicial de órdenes (draft→assigned; datos semilla), multi-tenant, dashboard de métricas,
notificaciones push, i18n.
