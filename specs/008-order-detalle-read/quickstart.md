# Quickstart — Detalle de orden (read-side) · #010

Guía de validación end-to-end del endpoint `getOrderDetail` (`GET /v1/orders/{orderId}`). No incluye
implementación; los detalles de contrato y datos están en [contracts/orders.openapi.yaml](../../contracts/orders.openapi.yaml)
(op. `getOrderDetail`, v1.5.0) y [data-model.md](./data-model.md).

## Prerrequisitos

- Docker Compose arriba (BD `db` y BD de test `db-test` en :5433). Migraciones aplicadas (sin migración nueva de #010).
- Seed con: un technician T1 con orden propia rechazada SIN atender (`in_progress`, última reject > último submit);
  una orden de T1 ya reenviada (`pending_review`); una orden de otro technician T2; una orden en `pending_review`
  para un supervisor S1; una orden `assigned`/`in_progress` para un dispatcher D1; una orden `draft` y una `closed`.

## Comandos

```bash
# Backend (desde repo root)
cd backend
npm run test:unit          # dominio: visibilidad, ciclo vigente, rechazo-sin-atender, fail-closed
npm run test:contract      # getOrderDetail × 200/401/404/500/503; evidence/notes opcionales
npm run test:integration   # BD real: por rol, ramas 404, snapshot concurrente, auditoría de accesos denegados
```

## Escenarios de validación (mapeo a SC/FR)

| # | Actor / caso | Petición | Resultado esperado | Cubre |
| - | ------------ | -------- | ------------------ | ----- |
| 1 | T1, orden propia rechazada SIN atender | `GET /v1/orders/{id}` | `200`: order + notes + evidence (ciclo vigente) + `last_rejection_reason` **saneado** | SC-001, SC-002, FR-001/002/003 |
| 2 | T1, orden propia ya reenviada (`pending_review`) | `GET .../{id}` | `200` **sin** `last_rejection_reason` (clave omitida) | SC-002, FR-003 |
| 3 | T1, orden propia nunca rechazada, sin ciclo aún (`assigned`) | `GET .../{id}` | `200`: `evidence={count:0,content_types:[]}`, `notes` omitido, sin motivo | FR-001, D3 |
| 4 | T1 pide orden de T2 (ajena) | `GET .../{id}` | `404` genérico (mismo cuerpo que inexistente) | SC-003, FR-004/005 |
| 5 | Supervisor S1, orden en `pending_review` | `GET .../{id}` | `200`: order + notes + evidence; **sin** `last_rejection_reason` | SC-001, FR-002/005 |
| 6 | Dispatcher D1, orden `assigned`/`in_progress` | `GET .../{id}` | `200`: solo campos de order; **sin** `notes`/`evidence`/motivo | FR-002, FR-005 |
| 7 | Cualquier rol, orden `draft` o `closed` | `GET .../{id}` | `404` genérico | FR-004 |
| 8 | Sin token + `orderId` malformado | `GET .../xxx` | `401` (precede a visibilidad); **no** 400/404 | FR-004 |
| 9 | Autenticado + `orderId` malformado | `GET .../xxx` | `404` genérico (**no** 400) | FR-004 |
| 10 | Rol no reconocido (claim raro) autenticado | `GET .../{id}` | `404` (alcance vacío, fail-secure) | FR-004 |
| 11 | Orden con 2+ ciclos rechazo-reenvío | `GET .../{id}` | motivo del **último** rechazo (no de un ciclo anterior) | FR-003, C-005 |
| 12 | GET vs `submitOrderExecution` **en vuelo** (interleaving determinista: advisory lock / dos clientes) | `GET .../{id}` | motivo+notas del **mismo** ciclo (snapshot atómico) | FR-003, D4 |
| 13 | Reasignación T1→T2 **concurrente** con el GET (guard+lectura en el mismo snapshot) | T2 `GET .../{id}` / T1 `GET` | T2 ve motivo + notas/evidencia del ciclo anterior; T1 (ex-dueño) → `404` **incluso en la carrera** | FR-005, S-003, D4 |
| 14 | Redactor PII falla al servir el motivo | `GET .../{id}` | `200` **sin** `last_rejection_reason` (fail-closed); nunca `reason` crudo | FR-006, SC-004 |
| 15 | Cualquier 401/404 | — | **entrada de log best-effort** de acceso denegado con `recurso` saneado (UUID o `<malformed>`); fallo del logger no bloquea. (Registro durable append-only = feature #009) | FR-009 |
| 16 | Cualquier respuesta / logs | — | **0** `object_ref` en cuerpo (todo rol); **0** PII estructural en el motivo; `reason` crudo **0** en logs | SC-004, FR-006 |
| 17 | Contrato (validación **estricta** additionalProperties:false) | `GET .../{id}` | conforme a `OrderDetailResponse` **sin campos extra**; `evidence`/`notes` opcionales; dispatcher los omite | FR-008 |
| 18 | Mínimo privilegio XI: `?auditId=`/`?history=`/otra ruta | `GET .../{id}?auditId=...` | se ignora; la respuesta nunca lleva >1 campo de auditoría; ninguna vía a otra transición/orden/registro | SC-005 |

## Criterio de "hecho" (para G3)

- Todos los escenarios 1–18 verdes; contract test 100% (5 códigos); cobertura dominio ≥80% y servicios ≥80%.
- Arch test: el handler de #010 **no** importa write-side; no muta `status`/`version`.
- Gate G3 con 0 bloqueantes (panel + `revisor-implementacion`). Sin promptfoo (no hay IA en #010).
