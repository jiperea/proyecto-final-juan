# Bitácora — 007 Resumen de incidencia por IA

Diario de la feature (Brief Func #5): decisiones, recorrido de gates, hallazgos y lecciones.
**Estado final:** G1 PASS · G2 PASS · G3 PASS (0 bloqueantes, 0 ALTAs) · 421 tests verdes.

## Qué es

Endpoint `summarizeOrderIncident` (`POST /v1/orders/{orderId}/ai-summary`, sólo **supervisor**): resume la
incidencia de una orden en `pending_review` a partir de las notas de ejecución (005) + metadatos de evidencia,
para apoyar la revisión (006). La IA **no inventa** (fallback) ni **filtra PII** (minimización por capas), anclado
a eval (promptfoo). Proveedor por CLI (`claude -p`) en dev, **mock** en tests. Arquitectura hexagonal (dominio IA
puro tras puertos). Sin migración.

## Recorrido de gates (por qué costó y qué se aprendió)

- **G1 (clarify):** PASS en 3 pases. Fijó el núcleo: minimización de PII obligatoria (no stretch), fallback
  alcanzable (proveedor declara `sufficient=false` + corto-circuito), precedencia de errores, evento de acceso.
- **G2 (analyze):** 4 rondas. Empezó en 0 bloq/7 ALTAs y fue destapando cuestiones cada vez más profundas
  (contradicción de precedencia, umbrales de Constitution VIII ausentes, prompt-injection del technician,
  rúbrica del eval, `attempt` cruzado entre tablas, gaming de 0-claims, JSON malformado, escape del delimitador,
  temperatura del CLII). Se remedió **en cascada vía skills** (specify→plan→tasks) y se cerró tras **aligerar el
  panel por fase** (G2 = consistencia + rbac; sin el cínico generalista que re-litigaba el spec) y **sembrar los
  residuales ya trazados** (`gates/dispositioned.md`) para que no reaparecieran.
- **G3 (implement):** varias rondas. Cazó defectos **reales** que los tests verdes no ven: inyección de comandos
  del SO (invocación por shell), secretos del backend heredados por el subproceso, `orderId` con PII crudo en el
  log de acceso, contract-first (500 no declarado), clases de PII estructurada no cubiertas. Todos arreglados o
  acotados+trazados. Cierre en **0 bloq/0 ALTA**.

## Decisiones clave

- **Umbral mínimo de contenido (FR-015, Constitution VIII):** notas crudas ≥30 chars no-ws **Y** ≥1 evidencia,
  del **ciclo vigente** (`auditId` del último submit → `pending_review`; no `max(attempt)` por-tabla).
- **Precedencia:** `401→403→429→404→proveedor`; guards **dentro del handler** (K5) para emitir evento `denied`
  en cada rechazo. Errores transversales: BD no disponible → 503 (conv. 001/006); inesperado → 500 (declarado).
- **Salida:** `blocked_pii` (PII) gana sobre cualquier otra no-conformidad → `fallback_insufficient`
  (longitud/vacío/JSON-malformado colapsan; sin sub-orden inobservable).
- **Seguridad del proceso (FR-009c → Constitution IX v1.8.0):** `execFile`/argv/`stdin`, nunca shell; `env`
  mínimo (no hereda secretos); `stderr` suprimido; notas nonce-delimitadas como datos no confiables (FR-016).
- **Temperatura (FR-009b):** `temperature=0` configurada; el CLI no expone flag de sampler → determinismo
  best-effort (prompt + anti-flakiness del eval); control real = proveedor con API (BL-072).
- **Evento de acceso:** sin PII, `{actor, orderId, outcome, deniedReason?}`; `orderId` no-UUID → `<malformed>`.

## Deuda trazada (backlog, ninguna bloquea el MVP)

- **BL-072** proveedor de producción (TLS/DPA + re-ejecutar eval + control real de temperatura).
- **BL-073** PII de nombres/direcciones en texto libre (best-effort prompt+eval).
- **BL-074** segmentación por equipo/tenant del alcance de visibilidad (amplificación de cosecha de PII).
- **BL-075** juez de fidelidad en runtime (hoy anclado-a-eval offline).
- **BL-076** robustez avanzada anti prompt-injection. **BL-077** juez del eval de familia distinta.
- **BL-078** rate-limit con store compartido (multi-réplica). **BL-079** clases de PII estructurada extra
  (pasaporte, póliza, cuenta no-IBAN).

## Lecciones de proceso (aplicadas)

1. **Remediar vía skills, no a mano** (regla de oro): un desliz de edición manual de plan/tasks se corrigió
   re-lanzando `/speckit-plan`+`/speckit-tasks`.
2. **Propagación COMPLETA:** un cambio (500/503-BD) no se cierra hasta tocar FR + plan + tasks + contrato +
   trazabilidad; el gate cazó los artefactos sin actualizar.
3. **Convergencia del panel adversarial:** es no-determinista y "cada garantía tiene un bypass más profundo".
   Se acota con (a) **modelo de amenaza explícito**, (b) **panel por fase** (no re-litigar lo cerrado en G1),
   (c) **sembrado de residuales dispuestos**, (d) **acotar las garantías a conjuntos enumerados** (PII) en vez
   de promesas abiertas. Regla de parada: **0 bloqueantes**; ALTAs se resuelven o se trazan.
4. **Integridad del gate:** `gate.sh` reintenta al agente sin JSON válido y marca **INCONCLUSO** (nunca "0
   huecos" silencioso) → evita el falso verde por un panelista caído. Ejecución **secuencial por defecto**
   (el CLI throttlea prompts grandes concurrentes); paralelo opt-in (`GATE_PARALLEL=1`).

## Trazabilidad y tests

`docs/traceability.md` (sección 007) mapea FR-001..016 (incl. FR-009b/c, FR-015/16) → endpoint → tarea → test.
51 tests nuevos (unit dominio/proveedor/redactor + contract + integración ok/fallback/authz/rate-limit/pii/
provider-failure/source-failure/access-event). Eval promptfoo (`evals/`) para la sesión dev autenticada (G3, K7).
