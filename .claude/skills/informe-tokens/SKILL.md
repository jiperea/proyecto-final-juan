---
name: informe-tokens
description: Genera un informe de consumo (ccusage) y ahorro (RTK) de tokens en la carpeta informes/, local y sin coste de API. Úsalo al cerrar una fase/spec o cuando quieras una foto para analítica. Trigger, el usuario escribe /informe-tokens.
---

# informe-tokens — Foto de consumo y ahorro de tokens

Genera un informe con el consumo real (ccusage) y el ahorro de RTK, **local y sin API**, y lo guarda en
`informes/` para consulta futura.

## Pasos

1. **Recoge los datos** (todo local, sin API):
   - Consumo mensual: `ccusage monthly` (y si se quiere el día: `ccusage daily`).
   - Ahorro por proyecto: desde la raíz del repo, `rtk gain --project`.
   - Ahorro global + cuota: `rtk gain --quota -t 20x`.
   - (Opcional, si se arregla la versión) `rtk cc-economics -f json` para consumo+ahorro combinado.
2. **Escribe el informe** en `informes/AAAA-MM-DD-tokens.md` con:
   - Tabla de consumo por mes (tokens + coste estimado) y modelos en uso.
   - Ahorro RTK por proyecto y global.
   - Una breve lectura (qué explica el consumo/ahorro de esta fase o spec).
   - Si es el informe de una spec concreta, indica la **rama** y la **ventana temporal** trabajada, y
     cruza con `ccusage daily` / `rtk gain --daily` para aproximar el consumo de esa spec.
3. **Actualiza el índice** en `informes/README.md` (añade una línea al listado de informes).
4. Recuerda al usuario que el coste de ccusage es **estimación local**, no billing autoritativo.

## Notas

- No usa la API de pago: `ccusage` parsea los JSONL locales de Claude Code; `rtk` es un proxy local.
- `rtk cc-economics` combinaría ambos, pero puede fallar por desajuste de versión con ccusage
  (`missing field 'month'`); en ese caso usa `ccusage` y `rtk gain` por separado.
- Skill genérica y reutilizable: promovible a `~/.claude/skills/` para usarla en cualquier proyecto.
