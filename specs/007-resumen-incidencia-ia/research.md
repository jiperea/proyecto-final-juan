# Research — 007 Resumen de incidencia por IA (Phase 0)

Technical Context sin `NEEDS CLARIFICATION` pendientes (resueltos en clarify + remediación G1). Decisiones con
impacto, derivadas de la spec (G1 PASS), la Constitution (VIII/IX/XIV) y docs/10-evals-promptfoo.md.

## D1 — Abstracción del proveedor IA por puerto (hexagonal, III)

- **Decisión**: `AiSummaryProviderPort.generate(input) → Result<{summary, sufficient}>` en `domain/ai/`. La
  implementación `infra/ai/claude-cli-provider.ts` invoca `claude -p` por `node:child_process`. El dominio **no**
  importa `child_process`.
- **Rationale**: permite **mockear** el proveedor en tests (deterministas, sin red/CLI) y cambiar de proveedor
  (BL-072) sin tocar el dominio. Cumple III y FR-009.
- **Alternativas**: llamar al CLI desde el caso de uso (acopla dominio↔infra, no testeable sin CLI) — rechazado.

## D2 — Minimización de PII por capas (VIII, FR-003)

- **Decisión**: (a) **allowlist estructural** — solo notas (texto) + metadatos de evidencia (conteo,
  `content_type`); nunca `object_ref`/uuids/ids. (b) **redacción determinista por patrones** de PII estructurada
  (email, teléfono, matrícula, DNI/NIF) → `[REDACTED]`, en `pii-redactor.ts` (puro). (c) **nombres/direcciones**
  (texto libre): instrucción explícita en el prompt de no reproducir datos personales + verificación en el eval.
- **Rationale**: los patrones estructurados SÍ son regex-detectables (garantía de runtime); los nombres no lo son
  de forma fiable → se ancla a eval (estándar de la constitution, docs/10). Honesto y proporcionado (XV).
- **Alternativas**: NER local (dependencia pesada, sobredimensiona MVP → BL-073); no enviar notas (vacía el
  resumen). Rechazadas para el MVP.

## D3 — Fallback "no inventa" (FR-002)

- **Decisión**: fallback (`sufficient=false`, `summary=null`) cuando (1) el **proveedor declara** que no puede
  resumir con fidelidad, o (2) **corto-circuito determinista** (notas vacías tras saneo Y 0 evidencia) → sin
  llamar al proveedor. El contrato con el proveedor pide un JSON `{summary, sufficient}` (o un marcador claro),
  no texto libre a interpretar heurísticamente.
- **Rationale**: hace alcanzable el caso realista (notas pobres) vía golden cases; el corto-circuito evita gastar
  una llamada en el caso degenerado. Ancla VIII a un comportamiento verificable.
- **Alternativas**: solo chequeo de entrada (inalcanzable, G1/B3) — rechazado.

## D4 — Timeout y mapeo de fallos (FR-010)

- **Decisión**: **timeout duro 10 000 ms** en el subproceso. timeout/fallo de proceso → `503`
  (`SERVICE_UNAVAILABLE`); salida vacía tras trim / no conforme / con PII → `200` fallback (`sufficient=false`).
- **Rationale**: separa el fallo de infraestructura (reintentar, 503) del resultado de negocio (no reintentar,
  fallback). Testeable con provider mock que simula timeout/vacío/PII.
- **Alternativas**: sin timeout (cuelga, viola SC-006) — rechazado.

## D5 — Validación de la salida y no-fuga (FR-004, FR-014)

- **Decisión**: la salida pasa por: (1) `len ≤ 1200` (si no → fallback); (2) no vacía tras trim (si no →
  fallback); (3) **detector estructural** de PII (si detecta → `blocked_pii` → fallback). En el eval, además, se
  verifica ausencia de los literales de nombre/dirección conocidos del golden case.
- **Rationale**: determinista en runtime para lo que se puede (estructura/longitud/PII estructurada); el resto
  (nombres) al eval. Nunca se altera el resumen in-place (preserva fidelidad).

## D6 — Evento de acceso sin PII (FR-013, XI)

- **Decisión**: log estructurado (pino, categoría `access.ai_summary`) `{actor, orderId, timestamp, outcome}`
  con `outcome ∈ {success, fallback_insufficient, blocked_pii, error, denied}`. **Sin** prompt/resumen/`object_ref`.
  Sin tabla (MVP); almacenamiento durable/forense = #009.
- **Rationale**: rastro forense de quién consultó qué (mitiga la amplificación de exfiltración, A7) sin PII ni
  migración. `blocked_pii` da señal de seguridad distinguible.
- **Alternativas**: tabla de auditoría de accesos ahora (es #009/BL-002, sobredimensiona) — diferido.

## D7 — Rate-limit y precedencia (FR-008, FR-012)

- **Decisión**: reutilizar `InMemoryRateLimit` (001) con **10/60 s por usuario** para el endpoint IA. Precedencia
  `401 → 403 (rol) → 429 (rate-limit) → 404 (visibilidad) → proveedor (503|200)`. El 429 (por usuario) antes del
  404 para no filtrar existencia del recurso.
- **Rationale**: acota coste/abuso del proveedor; coherente con el patrón de 001 y la no-enumeración de 006.

## D8 — Eval con promptfoo (VIII/XIV, docs/10)

- **Decisión**: añadir `promptfoo` como **devDependency**; `/evals/promptfooconfig.yaml` con provider `claude -p`;
  `/evals/ia-resumen/golden-cases.yaml` (casos ricos → faithfulness/alucinación; casos pobres → fallback; casos
  con nombre/dirección/PII literal → no-fuga); `/evals/sc/007-*.yaml` para los SC. Gate **G3** ejecuta
  `npx promptfoo eval`; umbral no cumplido = bloqueante.
- **Rationale**: es la vía adoptada (build-vs-buy, docs/10) para anclar VIII/XIV. Sin API de pago (`claude -p`).
- **Nota**: el eval corre en G3, **fuera** del `vitest run` (no depende del CLI en CI unitaria; los tests de
  código mockean el proveedor).
