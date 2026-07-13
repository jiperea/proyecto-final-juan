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
- **Temperatura del proveedor (K-001, FR-009b)**: **`temperature = 0`** (`AI_TEMPERATURE`, default 0, validado al
  arrancar). **Rationale**: minimiza la variabilidad de muestreo → favorece **fidelidad** (SC-001 ≥ 0.90) y
  **reproducibilidad** del eval; Constitution VIII exige que la temperatura esté **definida en la spec**. Misma
  temperatura en runtime y en el eval promptfoo (paridad). **Sin cláusula de escape (T-001/H-005):** el proveedor
  DEBE invocarse con `temperature=0`; si el binario no expone el flag, es un **bloqueo de implementación** a
  resolver en T012 (envoltura/flag equivalente o proveedor alternativo), no una excepción — el test de FR-009b
  asevera `temperature=0` de forma determinista. **Alternativas**: aceptar el default del CLI (rompe la
  reproducibilidad de SC-001 y hace el test no determinista) — rechazada.
- **Contrato de salida del CLI y no-conformidad (H-003, FR-010)**: el provider **parsea y valida** el stdout como
  JSON `{summary, sufficient}`. **No conforme → 200 fallback** (no 503): (a) JSON no parseable/malformado; (b)
  `sufficient` ausente o no booleano; (c) `summary` ausente cuando `sufficient=true`; (d) vacío tras trim; (e)
  `>1200`; (f) con PII estructurada. El **503 queda solo** para timeout (>10 s) o fallo de proceso (exit≠0/crash).
  **Rationale**: distingue "el proveedor no respondió" (503) de "respondió algo inservible" (200 fallback, no
  inventa); evita colgar y evita propagar basura. **Alternativas**: tratar el JSON malformado como 503 — rechazado
  (el proceso sí terminó; es no-conformidad de salida, no indisponibilidad).

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
  resumir con fidelidad, o (2) **corto-circuito determinista** (notas **crudas** vacías/whitespace **pre-redacción**
  Y 0 evidencia; `[REDACTED]` no crea "vacío", K4) → sin
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
- **Asunción declarada (H-004, BL-078)**: `InMemoryRateLimit` es **por-proceso** → asume **instancia única** en
  dev/MVP; con N réplicas el límite efectivo es 10×N. Multi-réplica exige un **store compartido** (Redis) = BL-078.

## D8 — Eval con promptfoo (VIII/XIV, docs/10)

- **Decisión**: añadir `promptfoo` como **devDependency**; `/evals/promptfooconfig.yaml` con provider `claude -p`;
  `/evals/ia-resumen/golden-cases.yaml` (casos ricos → faithfulness/alucinación; casos pobres → fallback; casos
  con nombre/dirección/PII literal → no-fuga); `/evals/sc/007-*.yaml` para los SC. Gate **G3** ejecuta
  `npx promptfoo eval`; umbral no cumplido = bloqueante.
- **Rationale**: es la vía adoptada (build-vs-buy, docs/10) para anclar VIII/XIV. Sin API de pago (`claude -p`).
- **Nota**: el eval corre en G3, **fuera** del `vitest run` (no depende del CLI en CI unitaria; los tests de
  código mockean el proveedor).
- **Definición reproducible de métricas (T-001/T-002)**: unidad = **afirmación atómica**. El juez (rúbrica fija
  versionada en `promptfooconfig.yaml`, no prompt libre) descompone el `summary` en afirmaciones y marca cada una
  **binaria** `anclada|no_anclada` según *grounding* en la evidencia. **Por caso**: `faithfulness =
  ancladas/total`; `tasa_alucinacion = no_ancladas/total (= 1 − faithfulness)`. **Agregación**: media aritmética
  por caso; umbral `≥0.90`/`≤0.05` sobre esa media. Sin esto, 0.90 no sería reproducible.
- **Residual del juez (H-003, BL-077)**: el juez comparte familia de modelo con el generador → errores
  correlacionados (una alucinación plausible podría aceptarse). La rúbrica de **solo-anclaje** (no calidad) reduce
  el sesgo; endurecimiento = juez de familia distinta → BL-077.
- **Golden cases adversariales (FR-016/S-001)**: además de los casos ricos/pobres/PII, incluir casos de
  **prompt-injection** en las notas (órdenes embebidas, intento de exfiltración de nombre) que deben (a) no
  alterar el desenlace hacia "aprobar" y (b) no filtrar PII.

## D9 — Umbral mínimo de contenido (FR-015, VIII/K-001)

- **Decisión**: umbral **determinista** evaluado en el dominio **antes** del proveedor: notas crudas (pre-
  redacción, tras trim) `≥ 30` chars no-whitespace **Y** `≥ 1` **registro en `order_evidence`** — todo del
  **ciclo vigente** = el `auditId` del `submitOrderExecution` que produjo el `pending_review` actual (no
  `max(attempt)` por-tabla, H-001). 007 **no** define allowlist propia de `content_type`: **005 ya la
  valida** al subir (`EvidenceRef.content_type` = `{image/jpeg,image/png,image/webp,image/heic}`), así que toda
  evidencia persistida es válida por construcción (elimina la divergencia K-001/H-002). Si no → fallback sin
  proveedor. Configurable `AI_MIN_NOTES_CHARS=30` / `AI_MIN_EVIDENCE=1` (default normativo en la spec).
- **Rationale**: Constitution VIII **exige** que los umbrales numéricos (nº mínimo/longitud mínima de notas, qué
  es evidencia válida) vivan en la spec, no solo en el juicio del proveedor. Complementa (no sustituye) la capa
  del proveedor. 30 chars evita disparos por contenido trivial sin bloquear notas reales.
- **Alternativas**: "solo lo juzga el proveedor" (decisión G1) — **rechazada por choque con VIII** (K-001).

## D10 — Notas como datos no confiables (FR-016, S-001)

- **Decisión**: el prompt estructura las notas del technician con **delimitador = nonce aleatorio por petición**
  (impredecible; H-004) y una **instrucción de sistema** de que el contenido entre delimitadores es **material a
  resumir**, no órdenes a obedecer. Antes de embeber, se **neutraliza cualquier ocurrencia del nonce** en las
  notas (evita que el technician cierre el bloque e inyecte fuera). La minimización de PII (D2) se aplica dentro
  de ese bloque.
- **Rationale**: el technician (rol inferior) autoría texto libre que llega al proveedor; sin delimitar,
  permitiría prompt-injection que sesgue la decisión del supervisor o intente exfiltrar PII (S-001). Es la
  mitigación estándar (datos ≠ instrucciones); el residual avanzado = BL-076.
- **Alternativas**: confiar solo en la instrucción anti-PII (FR-003c) sin delimitar — insuficiente ante inyección.
