# Residuales dispuestos — G1 024 (ronda 1 → 2). NO re-levantar salvo problema NUEVO/regresión.

## Bloqueantes (resueltos)
- **H-001** (atomicidad blob+BD imposible): FR-011 → blob primero; la transacción Postgres (metadatos+transición+auditoría) es la verdad atómica; huérfano purgado por GC.
- **H-002** (front necesita IDs de evidencia, solo tiene count): FR-014 → el detalle expone `items:[{evidenceId,content_type}]` (compatible).
- **S-001** (URL firmada = bearer libre): FR-004/FR-013 → token ligado a principal+orden+evidencia, single-use, TTL≤300s; front por fetch a blob (sin URL en DOM/Referer).
- **S-002** (ámbito supervisor indefinido): FR-003/FR-016 → autorización = la de `getOrderDetail` (org plana; supervisor ve pending_review); sin partición por equipo.
- **S-003** (reasignación y acceso): FR-016 → acceso sigue a `getOrderDetail`; nuevo dueño accede, saliente pierde.

## Altas (resueltas)
- **H-003** (evidencia entre ciclos rechazo/reenvío): FR-017 → evidencia del ciclo vigente; reenvío reemplaza.
- **H-004** (disparo de purga): FR-018 → job programado, no perezoso.
- **H-005** (URL compartida dentro del TTL): FR-004 single-use + ligada al principal; FR-013 sin exponerla.
- **H-007** (contrato dejaba alternativas abiertas): sección Contrato reescrita a lo resuelto (multipart; getOrderEvidence 200; sin pre-signed).
- **H-008** (trazabilidad 3/13): tabla ampliada a los 18 FR.
- **T-001/S-004** (403 «o» 404): FR-007 → 404 uniforme determinista, nunca 403.
- **T-002** (supervisor autorizado): = autorización de getOrderDetail.
- **S-005** (evidenceId∈orderId): FR-015 → verifica pertenencia; mismatch 404.
- **S-006** (fuga por DOM/Referer/historial): FR-013 → blob same-origin, Referrer-Policy no-referrer, no-store.

## Medias (resueltas)
- **H-006/T-005** (contradicción retención): Assumptions → 90d decidido y fijo (no pendiente).
- **H-009** (tipo declarado vs contenido real): FR-019 → validación de magic-bytes.
- **H-010** (gestión de clave AES): Assumptions → clave en secreto validado al arrancar, no hardcodeada; dev con clave real.
- **T-003** (contrato con pre-signed abierto): resuelto con H-007 (solo multipart).
- **T-004** (FR-002 «4xx» genérico): FR-002 → 415/413/422 concretos.
- **S-007** (acceso a `closed` en retención): Assumptions → hereda getOrderDetail, sin acceso especial.

## Ronda 2 (resueltos)
- **H-001-r2** (evidencia histórica sin binario): FR-009 → a autorizado, legacy/purgada = **410 «no disponible»** (indistinguibles).
- **S-001-r2** (precedencia 410 vs 404 = enumeración): FR-007 → autz PRIMERO; 410 solo visible a autorizados; no-autorizado siempre 404.
- **H-002-r2** (binarios de ciclo superado en orden viva): FR-017 → purga inmediata en el reemplazo; ids → 410.
- **H-003-r2** (JSON→multipart rompe submit): FR-012/Contrato → endpoint NUEVO `uploadOrderEvidence` (multipart); `submitOrderExecution` sin cambios (compatible de verdad).
- **H-004-r2** (302 del clarify vs 200-blob del endurecimiento): reconciliado → 200 same-origin + token firmado ligado al principal single-use ≤300s; SC-003 mide el token, no URL pública.
- **S-002-r2** (autz de subida sin FR): FR-020 → subida solo dueño actual + in_progress; 401/404.

## Ronda 3 (resueltos)
- **H-001-r3** (modelo de token autocontradictorio): RESUELTO decidiendo UN modelo — lectura **200 same-origin por sesión**, **sin token/URL de cliente**; la firma ≤300s es **interna backend↔store**. FR-004/005/013 + clarify + US2 + SC-003 alineados.
- **H-004-r3** (US2/SC-003 seguían con «URL firmada» de cliente): RESUELTO, reescritos al modelo de sesión.
- **H-002-r3** (ciclo upload↔submit): FR-022 → acumula pre-envío; abandonada/reasignada-antes-de-submit se purga; detalle in_progress muestra al dueño lo subido.
- **H-003-r3** (reasignación antes del submit con evidencia del saliente): FR-022 → se purga la staging del saliente; el nuevo dueño empieza sin evidencia.
- **H-005-r3** (representación de items legacy): FR-014 → usan el `id` de fila ya existente; abrir → 410.
- **T-001-r3** (415 vs 422 en contenido falseado): FR-019 → determinista: fuera de allowlist=415; en allowlist pero contenido no-imagen=422.
- **S-001-r3** (sin auditoría de LECTURA): FR-021 → auditar lectura (actor/orderId/evidenceId/ts) sin binario.

## Ronda 4 (simplificación anclada al schema verificado)
- **H-001/T-001/S-003-r4** (restos de «token single-use ligado al principal» en Contrato/trazabilidad): RESUELTO — purgado ese vocabulario; lectura = 200 same-origin por sesión, firma ≤300s interna; tests renombrados (session-serve / internal-signature-ttl).
- **H-002-r4** (FR-011 «una transacción atómica» falsa): RESUELTO — atomicidad **por operación**: upload escribe blob (sin fila); submit crea filas ligadas a auditId/attempt en su transacción; blobs no referenciados → GC.
- **H-003-r4** (discriminador de ciclo inexistente): RESUELTO — el modelo ya tiene **`attempt`+`auditId`** (verificado en schema.prisma); ciclo vigente = attempt/audit más reciente.
- **H-004-r4** (asunción de fila-por-ítem legacy sin verificar): RESUELTO — **verificado**: `OrderEvidence` tiene `id` por fila; items legacy usan ese id → 410.
- **H-005-r4** (instante del reemplazo): RESUELTO — el reemplazo/purga del ciclo anterior ocurre **en la transacción del nuevo submit** (no antes); si se abandona el reintento, la evidencia rechazada sigue disponible.
- **S-001-r4** (supervisor leyendo evidencia no enviada en in_progress): RESUELTO — los blobs staged no tienen fila → no direccionables por getOrderEvidence ni en getOrderDetail.items; nadie los lee por la API de lectura.
- **S-002-r4** (ventana de lectura de staging del saliente tras reasignar): RESUELTO — igual: sin fila, no hay evidenceId que abrir; GC limpia el blob huérfano.

## Ronda 5 (resueltos)
- **S-001/H-003-r5** (submit no re-verifica pertenencia de la ref staged): FR-023 → ref ligada a (dueño, orden); submit re-verifica o rechaza (404/422).
- **H-001-r5** (purga «en la tx PG» contradice no-transaccionalidad del blob): FR-017 → la tx PG marca superado (reemplazo lógico inmediato, 410); la purga física del blob es GC post-commit.
- **H-002-r5** (disparo/criterio del GC de staging): FR-024 → GC programado, TTL de staging 24h, distingue abandonado (>24h sin fila) de en-vuelo.
