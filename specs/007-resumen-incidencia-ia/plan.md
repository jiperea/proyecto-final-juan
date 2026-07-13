# Implementation Plan: Resumen de incidencia por IA (007)

**Branch**: `007-resumen-incidencia-ia` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md) (G1 PASS, 3 pases)

**Input**: spec de la feature IA (Brief Func #5). Un endpoint que resume la incidencia de una orden en
`pending_review` para el supervisor, con fidelidad anclada a eval, minimización de PII por capas, fallback
no-inventa, rate-limit y evento de acceso. Sin API de pago (`claude -p` / mock). 001/002a/004/005/006 inamovibles.

## Summary

Un endpoint HTTP `summarizeOrderIncident` (`POST /v1/orders/{orderId}/ai-summary`, solo **supervisor**) cuyo
pipeline sigue la **precedencia canónica `401 → 403 → 429 → 404 → proveedor`** (FR-012; el `429` precede al `404`
para no filtrar existencia): (1) **autenticación** (actor del token; sin actor → 401, lo cubre auth de 001); (2)
**rol supervisor** dentro del handler → **403** si no; (3) **rate-limit** por usuario (10/60 s) → **429** con
`Retry-After`; (4) resuelve la **visibilidad** (`pending_review`, alcance de 006) → **404** si no visible; (5) lee
notas de ejecución (005) + metadatos de evidencia; (6) **minimiza PII por capas** (allowlist estructural +
redacción determinista de PII estructurada + instrucción al proveedor para nombres/direcciones); (7) llama al
**proveedor IA por un puerto** (CLI `claude -p` en dev; **mock** en tests), con **timeout duro 10 s**; (8) valida
la salida (no vacía, ≤1200, sin PII estructurada → si no, **fallback `sufficient=false`**); (9) **en cada salida**
(éxito, fallback, rechazo o error) emite un **evento de acceso sin PII** con `outcome ∈ {success,
fallback_insufficient, blocked_pii, error, denied}` (clasificación: **`blocked_pii` si hay PII (gana); toda otra
no-conformidad —longitud/vacío/JSON-malformado— colapsa en `fallback_insufficient`**, sin sub-orden, K3/H-001);
(10) devuelve `IncidentSummaryResponse { summary: string|null, sufficient:
boolean }`. La fidelidad/alucinación/no-fuga/fallback se anclan a **promptfoo** (golden cases, gate G3).
**Sin migración** (lee `orders`/`order_execution_notes`/`order_evidence`; el evento de acceso es log estructurado
sin PII). Arquitectura hexagonal: dominio IA **puro** (redactor + caso de uso) tras un **puerto de proveedor**.
Los **guards (rol, rate-limit, visibilidad) viven dentro del handler** (no en middleware genérico) para que
**cada** rechazo emita su evento de acceso `denied` (SC-007, K5).

## Technical Context

**Language/Version**: TypeScript 5 (`^5.5.4`, strict) · Node 18+ (Docker).
**Primary Dependencies**: Express 4, Prisma `^5.18.0` (solo lectura aquí), Zod `^3.23.8`, `pino ^9.3.2`,
`jsonwebtoken` (001). **Nuevas**: `promptfoo` (devDependency, evals + gate G3, docs/10); proveedor IA por **CLI**
(`claude -p`, invocado con `node:child_process` con timeout; **`temperature=0` configurado** —FR-009b— aunque el
CLI **no expone flag de sampler**: determinismo best-effort por prompt + anti-flakiness del eval; el control real
de temperatura es del proveedor de prod con API, BL-072) — abstraído tras un puerto. El provider **parsea y valida** el stdout
como JSON `{summary, sufficient}`; JSON malformado / `sufficient` ausente-o-no-booleano / `summary` ausente con
`sufficient=true` → **salida no conforme → 200 fallback** (NO 503; el 503 es solo timeout/fallo de proceso, H-003).
**Storage**: PostgreSQL 16 (solo **lectura** de notas/evidencia/orden). **Sin migración** (0 tablas nuevas). El
**evento de acceso** (FR-013) es un **log estructurado sin PII** (pino, categoría dedicada); su almacenamiento
durable/forense se alinea con #009 (BL-002), no se crea tabla en 007.
**Testing**: Vitest + Supertest (unit dominio sin BD/mock del proveedor · integración BD real con proveedor
**mock** · contract). **Eval**: `npx promptfoo eval` en G3 con provider `claude -p` (golden cases), fuera del
`vitest run`.
**Target Platform**: servicio HTTP Linux. **Project Type**: web service hexagonal (solo `backend/`).
**Performance Goals**: n/a de latencia de endpoint (depende del proveedor); **timeout duro 10 000 ms** (FR-010).
**Constraints**: no PII cruda a terceros (VIII, redacción por capas antes del proveedor); **`temperature=0`
configurado** (`AI_TEMPERATURE`, Zod fail-fast, FR-009b; sampler-flag no disponible en el CLI → best-effort +
anti-flakiness, control real en BL-072); prompt/resumen **no** se persisten ni se
loguean (ni por `stderr` del subproceso — se suprime); actor server-side; precedencia
`401→403→429→404→proveedor`; fallback determinista; `summary ≤ 1200`; salida no conforme (incl. JSON malformado) →
200 fallback, timeout/fallo → 503; evento de acceso sin PII. **Sin** persistir resumen, **sin**
procedencia/staleness (stretch), **sin** proveedor de producción decidido (BL-072).
**Scale/Scope**: 1 endpoint, 16 FR (FR-001..016, incl. FR-009b/FR-009c), 7 SC, 0 migraciones, 1 puerto de proveedor + 1 redactor de PII + 1 caso de
uso de dominio + arnés de evals promptfoo.

## Constitution Check

*GATE: pasa antes de Phase 0 y se re-comprueba tras Phase 1.*

### Gate · Contract-First (II)
- [x] Se **extiende** `contracts/orders.openapi.yaml` con `summarizeOrderIncident` (200/401/403/404/429/500/503;
  el 500 = error inesperado, el 503 = timeout/fallo del proveedor **o** BD no disponible al leer la fuente conv. 001/006) +
  schema `IncidentSummaryResponse`, **antes** del código (Phase 1; Spectral OK).
- [x] Zod derivado; `snake_case` externo / `camelCase` interno; el `200` cubre resumen y fallback (por `sufficient`).

### Gate · IA: no inventa ni filtra PII, anclado a eval (VIII) — núcleo de esta feature
- [x] **Minimización de PII por capas ANTES del proveedor** (FR-003): allowlist estructural + redacción
  determinista de PII estructurada (email/teléfono/DNI-NIF/matrícula) + instrucción al proveedor para
  nombres/direcciones. No se envía `object_ref`/uuids.
- [x] **No-fuga en salida** (FR-004): detector estructural en runtime → si PII, fallback; nombres/direcciones
  verificados en el **eval** (golden cases de literales conocidos).
- [x] **Umbral numérico de contenido DEFINIDO en la spec** (FR-015, K-001 — VIII lo exige): notas crudas `≥30`
  chars no-whitespace **Y** `≥1` registro en `order_evidence` (007 **no** redefine allowlist; hereda la de 005 —
  toda evidencia persistida es válida), sobre el **ciclo vigente** (`auditId` del submit → pending_review, H-001);
  configurable (`AI_MIN_NOTES_CHARS`/`AI_MIN_EVIDENCE`); evaluado en el dominio **antes** del proveedor. (Antes
  ausente; ahora alineado con VIII y sin divergencia con 005.)
- [~] **Temperatura definida en la spec** (FR-009b, VIII): `temperature=0` **configurada** (`AI_TEMPERATURE`) y
  pasada a cualquier proveedor que la exponga. **Honestidad (I-001):** el CLI `claude -p` **no** expone flag de
  sampler → con el CLI el determinismo es **best-effort** (directiva en prompt + anti-flakiness del eval K7); el
  control real de `temperature=0` es del proveedor de producción con API → **BL-072**. No se promete un control
  que el CLI no ofrece (corrige la redacción absolutista previa).
- [x] **Fallback no-inventa de dos capas** (FR-002): (1) umbral determinista FR-015 (sin proveedor) + (2)
  proveedor declara `sufficient=false` (golden cases pobres).
- [x] **Anti prompt-injection del technician** (FR-016, S-001): notas pasadas como **datos delimitados no
  confiables** + instrucción de sistema de no obedecer órdenes embebidas; golden cases adversariales en G3.
- [x] **Eval promptfoo** (VIII/XIV): faithfulness ≥ 0.90, alucinación ≤ 0.05, no-fuga, fallback; gate G3 falla si
  no se cumple. Provider `claude -p` (sin API de pago).
- [~] **Residual de PII en texto libre** (nombres/direcciones sin regex de runtime): best-effort honesto,
  **trazado BL-073** — ver Complexity Tracking.

### Gate · RBAC y seguridad (IV, IX, XI)
- [x] `requireRole('supervisor')` **dentro del handler** (no en middleware genérico, K5) + rate-limit por usuario
  → 429 + visibilidad `pending_review` (alcance de 006) → 404 no-enumeración; precedencia
  `401→403→429→404→proveedor` (FR-012). Actor del token.
- [x] **Evento de acceso en CADA salida, incl. `denied`** (K5): al vivir los guards en el handler, cada rechazo
  (403/429/404) emite su evento `outcome=denied` vía `AccessLogPort` antes de responder (SC-007 = 100%). El `401`
  (sin actor) lo cubre auth de 001 y no emite evento. Clasificación de outcome: `blocked_pii` si hay PII (gana);
  toda otra no-conformidad → `fallback_insufficient` (K3/H-001, sin sub-orden longitud/vacío).
- [x] Prompt/resumen no se persisten ni loguean (incl. `stderr` del subproceso, FR-005). **Evento de acceso**
  sin PII (FR-013), con `blocked_pii` distinguible (valor forense).
- [~] **Proveedor de producción** (TLS/DPA si es remoto, IX) diferido a **BL-072**; almacenamiento durable del
  evento de acceso alineado con **#009**. Ver Complexity Tracking.
- [x] **Modelo de amenaza explícito** (spec §Modelo de amenaza): actor en alcance = **supervisor autenticado que
  abusa** de su acceso; fuera de alcance = externo sin credenciales (auth 001) y compromiso del `claude` local.
  Acota el análisis adversarial a amenazas accionables (evita el regreso infinito del panel de seguridad).
- [~] **S-001 — amplificación de cosecha de PII entre ámbitos**: el resumen IA abarata la exfiltración vs 006;
  mitigado por rate-limit + evento de acceso + minimización; segmentación por equipo/tenant = **BL-074**
  (revisión obligatoria antes de datos reales a escala). Ver Complexity Tracking.
- [~] **H-002 — fidelidad no verificable en runtime**: modelo anclado-a-eval de VIII (fidelidad solo por golden
  cases offline en G3); juez de fidelidad en runtime = **BL-075**. Residual aceptado. Ver Complexity Tracking.
- [~] **Residuales sistémicos ronda 3**: **S-001** prompt-injection avanzado = **BL-076**; **H-003** juez de la
  misma familia que el generador = **BL-077**; **H-004** rate-limit in-memory asume **instancia única** (multi-
  réplica → store compartido) = **BL-078**; **H-005** el eval es específico del proveedor → cambiar proveedor
  (BL-072) exige **re-ejecutar el eval**. Todos con condición de revisión antes de datos reales/escala.

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
- [x] **Ejecución de G3 sin secretos (K7)**: el eval promptfoo usa provider `claude -p` (**CLI, sin API de
  pago**), que se ejecuta **donde el CLI ya está autenticado** — la **sesión de dev del programa** (regla del
  programa: todo por el plan CLI). No requiere API key en repo/CI. La **automatización en CI** del eval se
  difiere a la fase **DevOps/DO** (runner con CLI autenticado); **no** bloquea el G3 local, que es el que ancla
  VIII en este flujo. Se documenta explícitamente que G3 es reproducible en la sesión dev autenticada.
- [x] **Anti-flakiness del LLM-judge (K7)**: para que el gate que ancla VIII no sea intermitente, la métrica de
  `faithfulness` se evalúa con **política de reintento acotado** (hasta 2 reintentos del judge por caso) y se
  exige **margen sobre el umbral** (objetivo de diseño ≥ **0.92** frente al umbral duro 0.90, para absorber el
  ruido ±0.02 del judge); un caso en zona gris (0.89–0.91) se **re-evalúa**, y solo su mediana decide. La
  configuración concreta (reintentos/tolerancia) vive en `evals/promptfooconfig.yaml`.

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
│   │   ├── summarize-incident.ts          #   caso de uso: evalúa UMBRAL FR-015 (≥30 chars no-ws Y ≥1 evidencia
│   │   │                                  #   válida) ANTES del proveedor → si no, fallback sin llamar; luego
│   │   │                                  #   minimiza → prompt con notas DELIMITADAS como datos no confiables
│   │   │                                  #   (FR-016) → puerto proveedor (timeout) → valida salida
│   │   │                                  #   (JSON conforme/no vacía/≤1200/sin PII → si no, fallback) → resultado
│   │   └── summary-ports.ts               #   AiSummaryProviderPort, IncidentSourcePort, AccessLogPort
│   ├── infra/
│   │   ├── ai/claude-cli-provider.ts      # NUEVO: implementa AiSummaryProviderPort via `claude -p`
│   │   │                                  #   (child_process, timeout 10s, temperature=0 configurado —CLI sin
│   │   │                                  #   sampler-flag, BL-072—; stdout parseado/validado
│   │   │                                  #   como JSON {summary,sufficient} → malformado=no conforme→fallback;
│   │   │                                  #   stderr suprimido → no PII; exit≠0/timeout → SERVICE_UNAVAILABLE)
│   │   └── repositories/incident-source-repository.ts  # NUEVO: lee orden(pending_review)+notas+evidencia
│   │                                      #   (metadatos) del CICLO VIGENTE (auditId del submit → pending_review;
│   │                                      #   NO max(attempt) por-tabla, H-001); NUNCA object_ref.
│   │                                      #   Error de conexión Prisma → throw domainError(SERVICE_UNAVAILABLE)
│   │                                      #   → handler (isDomainError) → 503; error inesperado → 500 (conv. 001/006)
│   ├── handlers/orders/ai-summary.ts      # NUEVO handler DELGADO. Los GUARDS viven AQUÍ (no en app.ts) para
│   │                                      #   emitir evento denied en cada rechazo (K5):
│   │                                      #   requireRole supervisor(403)→rate-limit(429)→visibilidad(404)→
│   │                                      #   minimiza→proveedor→valida→map; EMITE evento de acceso en CADA salida
│   ├── handlers/contract/{schemas,order-types}.ts  # +IncidentSummaryResponse (Zod/DTO)
│   ├── handlers/error-mapper.ts           # reutiliza RATE_LIMITED→429, SERVICE_UNAVAILABLE→503, FORBIDDEN_ROLE→403
│   ├── infra/ratelimit/                   # REUTILIZA InMemoryRateLimit (001), instancia para el endpoint IA
│   ├── infra/logger.ts                    # +categoría de evento de acceso (sin PII); REDACT ya cubre notas/reason
│   ├── infra/config.ts                    # +AI_PROVIDER, +AI_TIMEOUT_MS (10000), +AI_TEMPERATURE (0),
│   │                                      #   +AI_MIN_NOTES_CHARS (30), +AI_MIN_EVIDENCE (1) [FR-015], +rate-limit IA (10/60s)
│   └── handlers/app.ts                    # monta POST .../ai-summary SOLO con authenticate; rol/rate-limit/
│                                          #   visibilidad los aplica el handler (para emitir denied, K5)
├── prisma/                                # SIN cambios (sin migración)
├── evals/                                 # NUEVO (promptfoo): config + golden cases + SC
└── tests/{unit,integration,contract}/
package.json                               # +promptfoo (devDependency) + script eval
contracts/orders.openapi.yaml              # +summarizeOrderIncident, +IncidentSummaryResponse
```

**Structure Decision**: web service hexagonal. El **dominio IA es puro** y el proveedor se inyecta por puerto
(clave para mockear en tests y no acoplar a `child_process`/CLI). La minimización de PII vive en `domain/ai/
pii-redactor.ts` (pura, testeable). El evento de acceso se emite desde el handler vía `AccessLogPort` (log
estructurado sin PII). **Decisión de ubicación de los guards (K5):** `rol/rate-limit/visibilidad` se ejecutan
**dentro** del handler `ai-summary.ts` (no como middleware genérico en `app.ts`), de modo que **cada** rechazo
(`403/429/404`) pase por el punto único que emite el evento de acceso `outcome=denied` (SC-007 exige 100%,
incluidos los denegados). `app.ts` solo aplica `authenticate` (el `401` sin actor lo cubre auth de 001 y **no**
emite evento porque no hay actor). Sin migración (solo lectura + log).

## Complexity Tracking

| Desviación | Por qué se necesita | Por qué la alternativa simple se rechaza |
|---|---|---|
| **BL-073** — PII de nombres/direcciones best-effort (prompt + eval, no regex de runtime) | Los nombres/direcciones en texto libre no se detectan con regex de forma fiable; VIII se satisface al estándar anclado a eval (golden cases). | NER/modelo local sobredimensiona el MVP (XV) y añade dependencia pesada; no enviar notas vacía el resumen. Se traza para endurecer antes de datos reales sensibles. |
| **BL-072** — proveedor IA de producción (TLS/DPA si remoto **+ re-ejecución del eval** H-005 **+ control real de `temperature=0`** I-001) | En dev `claude -p` local; producción por decidir. IX exige TLS+DPA si se transmite PII a un tercero. La medición es específica del proveedor (cambiarlo **obliga a re-correr el eval**). **Además**, el CLI `claude -p` **no expone flag de temperatura de muestreo**: el control real de `temperature=0` (FR-009b) sólo es posible con un proveedor con API que lo exponga; con el CLI el determinismo es best-effort (prompt + anti-flakiness). | Decidir el proveedor de prod ahora excede el MVP; se traza como obligatorio (TLS/DPA + re-eval + sampler temperature) antes de un despliegue remoto. |
| Evento de acceso como **log** (no tabla) | MVP sin migración; el almacenamiento durable/forense es cluster de gobernanza. | Una tabla de auditoría de accesos es #009 (BL-002, entidad separada); crearla aquí sobredimensiona 007. |
| **promptfoo** como devDependency + gate G3 | Constitution VIII/XIV ancla la verificación IA a eval (docs/10); es la única forma de medir faithfulness/no-fuga/fallback. | Un motor de eval propio ya fue rechazado (docs/10, build-vs-buy). |
| **BL-074** — sin segmentación por equipo/tenant del alcance de visibilidad (S-001) | El resumen IA amplifica la cosecha de PII entre ámbitos; la segmentación exige un modelo de equipo/tenant que hoy no existe (heredado de 006). Se mitiga con rate-limit + evento de acceso + minimización. | Añadir segmentación ahora sobredimensiona 007 (XV) y depende de un modelo organizativo ausente; se traza con revisión obligatoria antes de datos reales a escala. |
| **BL-075** — fidelidad no verificable en runtime (H-002) | La "no-invención" en runtime es estructural; la fidelidad semántica solo se mide offline (eval, VIII anclado-a-eval). Un juez de runtime (2º modelo por petición) añade latencia/coste. | Exigir verificación semántica en runtime contradice el modelo anclado-a-eval de la constitution y el MVP; se traza para datos reales críticos. |
| **BL-076** — robustez avanzada anti prompt-injection (S-001) | FR-016 (notas como datos delimitados + instrucción de sistema) + golden cases adversariales mitigan, pero la robustez total frente a inyección en LLMs es problema abierto; el resumen es asesor (el supervisor decide). | Garantizar inmunidad total ahora es irrealizable; se acota con el diseño de datos-no-confiables + revisión antes de datos reales sensibles. |
| **BL-077** — juez y generador de la misma familia (H-003) | El LLM-as-judge comparte modelo con el generador (errores correlacionados); la rúbrica de anclaje por afirmación reduce el sesgo pero no lo elimina. | Un juez de familia distinta o verificación por reglas añade coste/dependencia; se traza para endurecer la medición de VIII. |
| **BL-078** — rate-limit in-memory asume instancia única (H-004) | El patrón de 001 es por-proceso; SC-005 y la mitigación de S-001 valen bajo instancia única (asunción declarada). Multi-réplica → 10×N. | Un store compartido (Redis) para el rate-limit excede el MVP mono-instancia; obligatorio antes de escalar horizontalmente. |
