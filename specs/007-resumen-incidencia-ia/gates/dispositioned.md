# Residuales YA dispuestos (007) — NO re-levantar como hallazgos nuevos

> Este fichero lista decisiones y residuales **ya analizados y dispuestos** con destino trazable (BL) o
> aceptados conscientemente en el Modelo de amenaza de `spec.md`. El panel adversarial **no debe volver a
> reportarlos** como hallazgos: ya tienen dueño y trazabilidad. Solo reportar problemas **nuevos** no cubiertos
> aquí, o una regresión real sobre lo ya decidido.

## Modelo de amenaza (alcance fijado)
- **Actores en alcance**: supervisor autenticado que abusa de su acceso; technician que autoría notas (contenido
  no confiable). **Fuera de alcance**: atacante externo sin credenciales (auth 001); compromiso del binario
  `claude` local de la sesión dev.

## Residuales aceptados / trazados (con BL)
- **BL-072** — proveedor IA de producción: TLS/DPA si remoto **+ re-ejecutar el eval** al cambiar de proveedor
  (la medición de fidelidad es específica del proveedor, H-005).
- **BL-073** — PII de **nombres/direcciones en texto libre**: sin regex de runtime (solo prompt-instruction +
  eval). Incluye el canal "technician pide devolver el nombre del cliente": mitigado por FR-016 (notas como datos
  no confiables) + FR-004 (estructural) + eval adversarial; el residual de nombres es best-effort conocido.
- **BL-074** — sin segmentación por equipo/tenant del alcance de visibilidad (amplificación de cosecha de PII,
  S-001). Mitigado hoy por rate-limit + evento de acceso + minimización.
- **BL-075** — fidelidad **no verificable en runtime** (modelo anclado-a-eval de VIII); incl. el caso de resumen
  pobre-en-hechos devuelto como `sufficient=true` (H-002 runtime). Anclado por eval + juicio humano del supervisor.
- **BL-076** — robustez avanzada anti prompt-injection en LLMs (problema abierto). Mitigado por FR-016
  (nonce-delimitado + neutralización de colisión) + golden cases adversariales; el resumen es asesor.
- **BL-077** — juez del eval de la **misma familia** que el generador (errores correlacionados). Mitigado por
  rúbrica de anclaje por afirmación; endurecimiento = juez de familia distinta.
- **BL-078** — rate-limit in-memory asume **instancia única**; multi-réplica → store compartido (Redis).
- **S-002 (→ BL-002/#009)** — inundación del log `denied` por un rol inferior (403 precede al 429): el evento es
  log rotable (M5); el store **durable** #009 resiste la erosión por rotación; endurecimiento (contar toda
  petición autenticada / dedup de denied) va con #009. Residual trazado, no re-levantar.

## Dispuestos en la ronda de cierre G2 (PASS, 0 bloqueantes) — resueltos en artefactos
- **K-001** (traz.): FR-009c añadido a la matriz de trazabilidad + T025. RESUELTO.
- **K-002** (consist.): clarificación ronda 3 "último attempt" marcada SUPERADA por auditId (ronda 4). RESUELTO.
- **K-003** (consist.): `Scale/Scope` del plan actualizado a 16 FR (incl. FR-009b/FR-009c). RESUELTO.
- **S-001** (MEDIA, forense): `outcome=denied` ahora lleva `deniedReason ∈ {role_403, not_visible_404,
  rate_limited_429}` (FR-013/data-model/T022). RESUELTO.

## Dispuestos en G3 (ronda 1) — resueltos vía skills (spec/plan/tasks) + código
- **I-001** (temperatura): FR-009b corregido a versión HONESTA — el CLI `claude -p` **no expone flag de
  sampler**; `temperature=0` queda **configurada** (AI_TEMPERATURE, default 0) y se pasa a proveedores que la
  expongan; con el CLI el determinismo es best-effort (directiva en prompt + anti-flakiness del eval); el
  control real → **BL-072** (proveedor con API). Test: config default + directiva en buildPrompt. RESUELTO —
  no re-levantar la versión absolutista previa.
- **K-001** (firma del puerto): T006 alineado a `AccessLogPort.record({actor,orderId,outcome,deniedReason?})`;
  timestamp lo estampa el logger. Coherente con FR-013/data-model/código. RESUELTO.

## Dispuestos en G3 (ronda 2) — propagación completa + seguridad
- **Contract-first 500 / BD→503**: 500 (INTERNAL) y 503-por-BD-no-disponible **declarados en el contrato** y
  propagados a **FR-010, FR-012, plan (Summary/Contract-First gate), tasks (T002/T004/T010/T021), trazabilidad**.
  El repo de fuente mapea errores de conexión Prisma → SERVICE_UNAVAILABLE (conv. 001/006); handler guard
  isDomainError. Tests: `ai-summary-source-failure`. RESUELTO — no re-levantar "500 no declarado / BD→500".
- **Seguridad — orderId malformado en el evento**: el `orderId` no-UUID (texto arbitrario del actor, posible PII
  inyectada en el path) se registra como **`<malformed>`**, nunca crudo → el evento sigue PII-free (FR-013/
  SC-007). Test en `ai-summary-access-event`. RESUELTO.
- **Propagación del outcome de negocio al evento**: `fallback_insufficient` y `blocked_pii` verificados en
  integración (no solo dominio), `ai-summary-access-event`. RESUELTO.

## Dispuestos en G3 (ronda 3) — cobertura de PII estructurada acotada
- **Clases de PII estructurada (BL-079)**: la garantía determinista se **acota a un conjunto ENUMERADO**
  `{email, teléfono, DNI/NIF/NIE, matrícula, IBAN, tarjeta}` (redactStructured + hasStructuredPii). **Otras
  clases estructuradas** (pasaporte, nº póliza/cliente, cuenta no-IBAN, y cualquier identificador futuro) son un
  **residual documentado BL-079**, best-effort por prompt-instruction + eval — igual enfoque que BL-073 (texto
  libre). **NO re-levantar "clase de PII estructurada X no cubierta"**: la garantía se declara sobre el conjunto
  enumerado, no sobre "toda PII estructurada" (enumeración infinita imposible de garantizar por regex).

## Controles de runtime cerrados (no reportar como huecos)
- **FR-009c** — invocación del subproceso `claude` por `execFile`/`spawn` (argv + `stdin`), NUNCA `exec`/shell →
  sin inyección de comandos del SO (S-001). Cerrado en runtime + test.

## Decisiones de diseño cerradas (no re-abrir sin causa nueva)
- Precedencia de errores `401→403→429→404→proveedor`; el 429 precede al 404 (no-enumeración).
- Guards (rol/rate-limit/visibilidad) **dentro del handler** para emitir evento `denied` en cada rechazo (K5).
- Outcome del evento: `blocked_pii` si hay PII (gana); toda otra no-conformidad → `fallback_insufficient`
  (longitud/vacío/JSON-malformado colapsan; sin sub-orden inobservable, H-001 ronda 4).
- `temperature=0` **obligatorio** (sin cláusula de escape); si el CLI no lo expone = bloqueo de implementación.
- Umbral FR-015: notas crudas ≥30 chars no-ws **Y** ≥1 registro en `order_evidence`, del **ciclo vigente**
  (`auditId` del submit → pending_review actual; **no** `max(attempt)` por-tabla). 007 no redefine allowlist de
  `content_type` (la hereda de 005).
- Salida no conforme (vacía / >1200 / JSON malformado) → **200 fallback**; timeout/fallo de proceso → **503**.
- Métricas del eval: unidad = afirmación atómica (por hecho, no por oración); binario anclada/no-anclada;
  `faithfulness = ancladas/total` por caso (0 claims → 0, no 1); PASS ⇔ media_set ≥0.90 ∧ tasa ≤0.05; el 0.92 es
  objetivo de diseño **no-gating**; zona gris [0.89,0.91] → re-eval ≤2 + mediana por caso.
