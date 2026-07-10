# Informes de consumo y ahorro de tokens

> Analítica de tokens **local y sin coste de API** (plan de empresa). Fuente de **consumo**: `ccusage`
> (lee los JSONL locales de Claude Code). Fuente de **ahorro**: **RTK** (`rtk gain`). Para consultar la
> evolución y el coste estimado por periodo/proyecto.

## Herramientas (ya instaladas)

- **RTK** (`rtk`) — proxy que optimiza operaciones de CLI y mide el **ahorro**:
  - `rtk gain --project` → ahorro **por proyecto** (filtra por el cwd actual).
  - `rtk gain --quota -t 20x` → ahorro global + estimación de cuota por tier de suscripción.
  - `rtk gain --daily|--weekly|--monthly -f json|csv` → series temporales para analítica.
  - `rtk session` → adopción de RTK por sesión de Claude Code.
- **ccusage** (`ccusage`) — **consumo** real (tokens + coste estimado) desde los JSONL locales:
  - `ccusage monthly` / `ccusage daily` / `ccusage session` (añade `-j` para JSON).
- **`rtk cc-economics`** combinaría consumo (ccusage) + ahorro (rtk), pero **ahora falla** por un
  desajuste de versión con ccusage (`missing field 'month'`). Workaround: usar `ccusage` y `rtk gain`
  por separado (lo hace la skill `/informe-tokens`).

## Cómo generar un informe

- **Automático:** ejecuta la skill **`/informe-tokens`** → escribe `informes/<fecha>-tokens.md` con la
  foto de consumo (ccusage) + ahorro (RTK, global y por proyecto).
- **Manual:**
  ```bash
  ccusage monthly
  cd ~/Documents/proyecto-final && rtk gain --project
  rtk gain --quota -t 20x
  ```

## Atribución por spec / fase

- **Por proyecto:** `rtk gain --project` (scope = repo) da el ahorro de todo el trabajo en `proyecto-final`.
- **Por spec:** como usamos **una rama por spec**, la atribución fina se hace por **ventana temporal**
  (cuándo se trabajó cada rama) cruzando `rtk gain --daily` / `ccusage daily` con el historial de git.
  `ccusage session` ayuda a nivel sesión. (RTK/ccusage no etiquetan por rama de forma nativa.)
- **Fase de fundación** (constitution + agentes + entorno): queda registrada en los informes por fecha
  (todo el trabajo previo a la primera spec).

## Notas

- El coste de `ccusage` es una **estimación local**, no el billing autoritativo (para facturación real,
  la Consola de Anthropic). Sirve para **analítica y tendencias**, que es el objetivo.
- Todo es **local y sin API**: `ccusage` parsea ficheros locales; `rtk` es un proxy local.

## Índice de informes

- [2026-07-10 · Fundación del proyecto](2026-07-10-tokens.md)
- [2026-07-11 · Diseño de 001 + gobernanza](2026-07-11-tokens.md) — métricas pendientes (sandbox sin ccusage/rtk)
