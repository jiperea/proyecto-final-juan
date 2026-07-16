# Residuales dispuestos — G1 023 (ronda 1 → 2). NO re-levantar salvo problema NUEVO o regresión.

## Altas
- **H-001/H-002/S-001** («siempre Tú» contradictorio + enmascara IDOR): RESUELTO. FR-002/US1-AS2/clarify → técnico **condicional**: «Tú» si `assigned_to`==usuario; identificador si no; neutro si nulo. La UI refleja el dato, no lo asume.
- **H-003** («foto N» asume imagen, ignora `content_types`): RESUELTO. FR-006 → etiqueta neutra derivada de `content_types` («Imagen/PDF/Adjunto N»), sin asumir foto.
- **H-004** (literal vs honesto): RESUELTO. Clarify → precedencia: estructura literal, contenido honesto; gana lo honesto.

## Medias
- **H-005/T-001** (sub-línea rama muerta): RESUELTO. FR-004/US2 → **se elimina** la sub-línea (contrato sin cliente/ubicación); cabecera = código + nombre.
- **H-006** (`notes` presente pero vacío): RESUELTO. FR-005/Edge → vacío/solo-espacios = ausente, sin tarjeta.
- **H-007/T-004** (count=0 contradicción FR↔edge): RESUELTO. Único comportamiento: «sin evidencia» + 0 tiles (FR-006 y Edge alineados).
- **H-008** (base de índice): RESUELTO. FR-006 → **1-based**.
- **H-009** (estados sin chip): RESUELTO. Edge → los 5 estados FSM tienen token de chip (FE-8); render siempre definido.
- **T-002** (fidelidad sin umbral): RESUELTO. SC-001/002 + rúbrica: checklist estructural objetiva + aprobación humana terminal.
- **T-003** («tarjeta» sin tokens): RESUELTO. FR-005 → tokens concretos (surface + border + `--radius-md` + `--shadow-1`).
- **S-002** (quién abre qué detalle): RESUELTO. FR-010 → detalle server-authoritative (query por id, 401/403/404 del backend), sin relajar.
- **S-003** (PII en notas/cliente): RESUELTO. FR-010 → misma exposición que hoy por rol, escapado, sin nueva superficie de PII ni logs.
