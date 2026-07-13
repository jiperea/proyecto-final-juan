# Quickstart / Validación: Resumen de incidencia por IA (007)

Contrato en [`../../contracts/orders.openapi.yaml`](../../contracts/orders.openapi.yaml) (op
`summarizeOrderIncident`); modelo en [`data-model.md`](./data-model.md); decisiones en [`research.md`](./research.md).

## Prerequisitos

- Docker Compose arriba (Postgres 16 de test). **Sin migración** (007 no cambia el esquema).
- Seed: 1 supervisor S, 1 technician T, 1 dispatcher D; órdenes en `pending_review` con notas + evidencia
  (vía 005), y alguna en otro estado (para 404).
- **Tests**: el proveedor IA se **mockea** (determinista, sin red/CLI) → `npm run test` no requiere `claude`.
- **Eval (G3)**: requiere `claude` CLI disponible (`AI_PROVIDER=claude-cli`) para `npx promptfoo eval`.

## Comandos

```bash
cd backend
docker compose up -d db-test
npm run test:unit          # dominio puro (sin BD): pii-redactor, summarize-incident (provider mock)
npm run test:contract      # summarizeOrderIncident × cada código (200/401/403/404/429/503)
npm run test:integration   # BD real + provider MOCK: RBAC, rate-limit, precedencia, fallback, no-log de PII
npm run eval               # promptfoo (G3): faithfulness/alucinación/no-fuga/fallback (provider claude -p)
```

## Escenarios que deben pasar (mapa a SC/FR)

| # | Acción | Esperado | SC/FR |
|---|---|---|---|
| 1 | S `POST /v1/orders/{id}/ai-summary` sobre `pending_review` con notas+evidencia (provider mock devuelve resumen fiel) | 200 `{summary, sufficient:true}` | SC-001, FR-001 |
| 2 | mock devuelve `sufficient=false` (notas pobres) | 200 `{summary:null, sufficient:false}` (fallback) | SC-002, FR-002 |
| 3 | orden con notas **crudas** vacías/whitespace (pre-redacción) Y 0 evidencia | 200 fallback **sin llamar al proveedor** (corto-circuito, K4) | FR-002 |
| 4 | notas con email/teléfono/DNI/matrícula centinela | el prompt enviado al mock lleva `[REDACTED]` (no el valor) | SC-003, FR-003 |
| 5 | mock devuelve una salida con PII estructurada | 200 fallback (`blocked_pii`), NO se devuelve el texto con PII | SC-003, FR-004 |
| 6 | mock devuelve >1200 caracteres | 200 fallback (no conforme), no truncado | FR-014 |
| 7 | sin token → 401; T/D → 403; orden ≠ pending_review / inexistente / uuid malformado → 404 | precedencia sin llamar al proveedor | SC-004, FR-006/007/012 |
| 8 | 11ª petición de S en 60 s | 429 `RATE_LIMITED` + `Retry-After`, sin llamar al proveedor | SC-005, FR-008/012 |
| 9 | provider mock excede 10 s / lanza | 503 `SERVICE_UNAVAILABLE` (no cuelga, sin detalle) | SC-006, FR-010 |
| 10 | `object_ref`/notas/resumen centinela; grep en logs y `stderr` | 0 apariciones; solo `id`/metadatos en logs | SC-003, FR-005 |
| 11 | cada petición (éxito/fallback/denegada) | evento de acceso `{actor,orderId,ts,outcome}` sin PII | SC-007, FR-013 |
| 12 | `actor_id` en el cuerpo | ignorado; actor = token | FR-012 (actor server-side) |

## Eval (promptfoo, G3)

- `faithfulness ≥ 0.90`, `tasa_alucinacion ≤ 0.05` (golden cases ricos).
- **fallback**: golden cases pobres → `sufficient=false`, 0 fabricados.
- **no-fuga**: golden cases con nombre/dirección/email/… literales → 0 apariciones en la salida.

## Comprobaciones de arquitectura/seguridad

- **Arch test**: `domain/ai/*` no importa `child_process`/Prisma/Express (el proveedor se inyecta por puerto).
- **No-fuga (FR-005)**: grep negativo de notas/`object_ref`/resumen en logs y `stderr` del subproceso.
- **No-enumeración (FR-007)**: 404 byte-idéntico para orden ajena/estado/inexistente.
- **No persistencia**: no se escribe prompt/resumen en BD; el evento de acceso no lleva PII.
