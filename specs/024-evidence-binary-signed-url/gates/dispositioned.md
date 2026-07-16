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
