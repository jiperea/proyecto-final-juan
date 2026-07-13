# Implementation Plan: Resumen de incidencia por IA (007)

**Branch**: `007-resumen-incidencia-ia` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md) (G1 PASS, 3 pases)

**Input**: spec de la feature IA (Brief Func #5). Un endpoint que resume la incidencia de una orden en
`pending_review` para el supervisor, con fidelidad anclada a eval, minimización de PII por capas, fallback
no-inventa, rate-limit y evento de acceso. Sin API de pago (`claude -p` / mock). 001/002a/004/005/006 inamovibles.

## Summary

Un endpoint HTTP `summarizeOrderIncident` (`POST /v1/orders/{orderId}/ai-summary`, solo **supervisor**) que: (1)
resuelve la visibilidad (`pending_review`, alcance de 006) → 404 si no visible; (2) aplica **rate-limit**
(10/60 s por usuario) → 429; (3) lee notas de ejecución (005) + metadatos de evidencia; (4) **minimiza PII por
capas** (allowlist estructural + redacción determinista de PII estructurada + instrucción al proveedor para
nombres/direcciones); (5) llama al **proveedor IA por un puerto** (CLI `claude -p` en dev; **mock** en tests),
con **timeout duro 10 s**; (6) valida la salida (no vacía, ≤1200, sin PII estructurada → si no, **fallback
`sufficient=false`**); (7) emite un **evento de acceso sin PII** (`outcome ∈ {success, fallback_insufficient,
blocked_pii, error, denied}`); (8) devuelve `IncidentSummaryResponse { summary: string|null, sufficient:
boolean }`. La fidelidad/alucinación/no-fuga/fallback se anclan a **promptfoo** (golden cases, gate G3).
**Sin migración** (lee `orders`/`order_execution_notes`/`order_evidence`; el evento de acceso es log estructurado
sin PII). Arquitectura hexagonal: dominio IA **puro** (redactor + caso de uso) tras un **puerto de proveedor**.

## Technical Context

**Language/Version**: TypeScript 5 (`^5.5.4`, strict) · Node 18+ (Docker).
**Primary Dependencies**: Express 4, Prisma `^5.18.0` (solo lectura aquí), Zod `^3.23.8`, `pino ^9.3.2`,
`jsonwebtoken` (001). **Nuevas**: `promptfoo` (devDependency, evals + gate G3, docs/10); proveedor IA por **CLI**
(`claude -p`, invocado con `node:child_process` con timeout) — abstraído tras un puerto (el dominio no lo importa).
**Storage**: PostgreSQL 16 (solo **lectura** de notas/evidencia/orden). **Sin migración** (0 tablas nuevas). El
**evento de acceso** (FR-013) es un **log estructurado sin PII** (pino, categoría dedicada); su almacenamiento
durable/forense se alinea con #009 (BL-002), no se crea tabla en 007.
**Testing**: Vitest + Supertest (unit dominio sin BD/mock del proveedor · integración BD real con proveedor
**mock** · contract). **Eval**: `npx promptfoo eval` en G3 con provider `claude -p` (golden cases), fuera del
`vitest run`.
**Target Platform**: servicio HTTP Linux. **Project Type**: web service hexagonal (solo `backend/`).
**Performance Goals**: n/a de latencia de endpoint (depende del proveedor); **timeout duro 10 000 ms** (FR-010).
**Constraints**: no PII cruda a terceros (VIII, redacción por capas antes del proveedor); prompt/resumen **no**
se persisten ni se loguean (ni por `stderr` del subproceso — se suprime); actor server-side; precedencia
`401→403→429→404→proveedor`; fallback determinista; `summary ≤ 1200`; evento de acceso sin PII. **Sin** persistir
resumen, **sin** procedencia/staleness (stretch), **sin** proveedor de producción decidido (BL-072).
**Scale/Scope**: 1 endpoint, 14 FR, 7 SC, 0 migraciones, 1 puerto de proveedor + 1 redactor de PII + 1 caso de
uso de dominio + arnés de evals promptfoo.

## Constitution Check

*GATE: pasa antes de Phase 0 y se re-comprueba tras Phase 1.*

### Gate · Contract-First (II)
- [x] Se **extiende** `contracts/orders.openapi.yaml` con `summarizeOrderIncident` (200/401/403/404/429/503) +
  schema `IncidentSummaryResponse`, **antes** del código (Phase 1; Spectral OK).
- [x] Zod derivado; `snake_case` externo / `camelCase` interno; el `200` cubre resumen y fallback (por `sufficient`).

### Gate · IA: no inventa ni filtra PII, anclado a eval (VIII) — núcleo de esta feature
- [x] **Minimización de PII por capas ANTES del proveedor** (FR-003): allowlist estructural + redacción
  determinista de PII estructurada (email/teléfono/DNI-NIF/matrícula) + instrucción al proveedor para
  nombres/direcciones. No se envía `object_ref`/uuids.
- [x] **No-fuga en salida** (FR-004): detector estructural en runtime → si PII, fallback; nombres/direcciones
  verificados en el **eval** (golden cases de literales conocidos).
- [x] **Fallback no-inventa** (FR-002): proveedor declara `sufficient=false` (golden cases pobres) + corto-circuito
  degenerado.
- [x] **Eval promptfoo** (VIII/XIV): faithfulness ≥ 0.90, alucinación ≤ 0.05, no-fuga, fallback; gate G3 falla si
  no se cumple. Provider `claude -p` (sin API de pago).
- [~] **Residual de PII en texto libre** (nombres/direcciones sin regex de runtime): best-effort honesto,
  **trazado BL-073** — ver Complexity Tracking.

### Gate · RBAC y seguridad (IV, IX, XI)
- [x] `requireRole('supervisor')` + visibilidad `pending_review` (alcance de 006) → 404 no-enumeración;
  rate-limit por usuario → 429; precedencia `401→403→429→404→proveedor` (FR-012). Actor del token.
- [x] Prompt/resumen no se persisten ni loguean (incl. `stderr` del subproceso, FR-005). **Evento de acceso**
  sin PII (FR-013), con `blocked_pii` distinguible (valor forense).
- [~] **Proveedor de producción** (TLS/DPA si es remoto, IX) diferido a **BL-072**; almacenamiento durable del
  evento de acceso alineado con **#009**. Ver Complexity Tracking.

### Gate · Arquitectura Hexagonal (III)
- [x] `domain/ai/` **puro**: `pii-redactor.ts` (funciones puras), `summarize-incident.ts` (caso de uso; no importa
  `child_process` ni Prisma), `summary-ports.ts` (puertos `AiSummaryProviderPort`, `IncidentSourcePort`,
  `AccessLogPort`). `infra/ai/claude-cli-provider.ts` implementa el puerto (subproceso + timeout). Handlers delgados.
- [x] **Test de arquitectura**: `domain/ai` no importa `child_process`/Prisma/Express; el proveedor se inyecta.

### Gate · Calidad y verificación (V, VI, VII, XIII, XIV)
- [x] FRs en EARS; trazabilidad RF→endpoint→tarea→test.
- [x] TDD fase Red; cobertura dominio ≥80% (redactor + caso de uso con provider mock), handlers ≥80%.
- [x] SC medibles: RBAC/rate-limit/precedencia/robustez por Vitest+Supertest (provider mock); fidelidad/no-fuga/
  fallback por **promptfoo** (G3). Gates G1 (PASS)/G2/G3, 0 bloqueantes.

**Resultado**: PASS (desviaciones diferidas y trazadas: BL-072 proveedor prod, BL-073 PII texto libre,
almacenamiento durable del evento de acceso → #009; ninguna de seguridad no-excepcionable sin cubrir — la
minimización por capas + eval satisface VIII al estándar anclado a eval de la constitution).

## Project Structure

### Documentation (this feature)

```text
specs/007-resumen-incidencia-ia/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/            # (canónico: contracts/orders.openapi.yaml, extendido)
├── checklists/requirements.md · gates/gate-G1-*
└── tasks.md              # /speckit-tasks (aún no)
evals/
├── promptfooconfig.yaml  # provider claude -p, thresholds
├── ia-resumen/golden-cases.yaml
└── sc/007-resumen-incidencia-ia.yaml
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── domain/ai/                         # NUEVO módulo de dominio, PURO (no child_process/Prisma/Express)
│   │   ├── pii-redactor.ts                #   redacción determinista de PII estructurada + detección (compartido
│   │   │                                  #   entrada/salida); nombres/direcciones = best-effort (BL-073)
│   │   ├── summarize-incident.ts          #   caso de uso: minimiza → prompt → puerto proveedor (timeout) →
│   │   │                                  #   valida salida (no vacía/≤1200/sin PII → si no, fallback) → resultado
│   │   └── summary-ports.ts               #   AiSummaryProviderPort, IncidentSourcePort, AccessLogPort
│   ├── infra/
│   │   ├── ai/claude-cli-provider.ts      # NUEVO: implementa AiSummaryProviderPort via `claude -p`
│   │   │                                  #   (child_process, timeout 10s, stdout; stderr suprimido → no PII)
│   │   └── repositories/incident-source-repository.ts  # NUEVO: lee orden(pending_review)+notas+evidencia (metadatos)
│   ├── handlers/orders/ai-summary.ts      # NUEVO handler DELGADO (auth→requireRole supervisor→rate-limit→
│   │                                      #   visibilidad 404→dominio→map; emite evento de acceso)
│   ├── handlers/contract/{schemas,order-types}.ts  # +IncidentSummaryResponse (Zod/DTO)
│   ├── handlers/error-mapper.ts           # reutiliza RATE_LIMITED→429, SERVICE_UNAVAILABLE→503, FORBIDDEN_ROLE→403
│   ├── infra/ratelimit/                   # REUTILIZA InMemoryRateLimit (001), instancia para el endpoint IA
│   ├── infra/logger.ts                    # +categoría de evento de acceso (sin PII); REDACT ya cubre notas/reason
│   ├── infra/config.ts                    # +AI_PROVIDER, +AI_TIMEOUT_MS (10000), +rate-limit IA (10/60s)
│   └── handlers/app.ts                    # monta POST .../ai-summary con authenticate+requireRole('supervisor')
├── prisma/                                # SIN cambios (sin migración)
├── evals/                                 # NUEVO (promptfoo): config + golden cases + SC
└── tests/{unit,integration,contract}/
package.json                               # +promptfoo (devDependency) + script eval
contracts/orders.openapi.yaml              # +summarizeOrderIncident, +IncidentSummaryResponse
```

**Structure Decision**: web service hexagonal. El **dominio IA es puro** y el proveedor se inyecta por puerto
(clave para mockear en tests y no acoplar a `child_process`/CLI). La minimización de PII vive en `domain/ai/
pii-redactor.ts` (pura, testeable). El evento de acceso se emite desde el handler vía `AccessLogPort` (log
estructurado sin PII). Sin migración (solo lectura + log).

## Complexity Tracking

| Desviación | Por qué se necesita | Por qué la alternativa simple se rechaza |
|---|---|---|
| **BL-073** — PII de nombres/direcciones best-effort (prompt + eval, no regex de runtime) | Los nombres/direcciones en texto libre no se detectan con regex de forma fiable; VIII se satisface al estándar anclado a eval (golden cases). | NER/modelo local sobredimensiona el MVP (XV) y añade dependencia pesada; no enviar notas vacía el resumen. Se traza para endurecer antes de datos reales sensibles. |
| **BL-072** — proveedor IA de producción (TLS/DPA si remoto) | En dev `claude -p` local; producción por decidir. IX exige TLS+DPA si se transmite PII a un tercero. | Decidir el proveedor de prod ahora excede el MVP funcional; se traza como obligatorio antes de un despliegue remoto. |
| Evento de acceso como **log** (no tabla) | MVP sin migración; el almacenamiento durable/forense es cluster de gobernanza. | Una tabla de auditoría de accesos es #009 (BL-002, entidad separada); crearla aquí sobredimensiona 007. |
| **promptfoo** como devDependency + gate G3 | Constitution VIII/XIV ancla la verificación IA a eval (docs/10); es la única forma de medir faithfulness/no-fuga/fallback. | Un motor de eval propio ya fue rechazado (docs/10, build-vs-buy). |
