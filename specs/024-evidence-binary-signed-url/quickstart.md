# Quickstart — Validación end-to-end de evidencia binaria (024)

Guía de validación (no implementación). Prueba que la feature funciona de punta a punta y que los controles de seguridad se cumplen. Detalle de entidades en [data-model.md](./data-model.md); contrato en [contracts/](./contracts/).

## Prerrequisitos

- Docker + `make dev` (backend + Postgres `db-test` en `:5433`, front con HMR).
- Seed con: 1 técnico dueño de una orden `in_progress`, 1 supervisor, 1 dispatcher, 1 orden `pending_review` con evidencia, 1 orden `closed`.
- Config nueva presente (fail-fast al arrancar): `EVIDENCE_ENC_KEY` (≥32 bytes), `EVIDENCE_SIGN_TTL_SECONDS=300`, `EVIDENCE_STAGING_TTL_HOURS=24`.

## Escenario 1 — Subir y enviar (US1)

1. Como **técnico dueño** (orden `in_progress`): `POST /v1/orders/{id}/evidence` (multipart, 1 JPEG válido) → **201** con `object_ref`.
2. Repetir con 2ª imagen → 2º `object_ref`. Intentar un 11.º → **422** (tope ≤10).
3. `POST /v1/orders/{id}/execution` (JSON, `evidence:[{object_ref,…}]` con los 2 refs) → **200**; orden pasa a `pending_review`; `count == 2`.
4. **Esperado**: 2 filas `OrderEvidence` creadas (mismo `auditId`/`attempt`); blobs cifrados en el store.

**Negativos**: subir tipo fuera de allowlist → **415**; imagen >25 MiB → **413**; JPEG con bytes de HTML (polyglot) → **422**; subir siendo no-dueño o en estado ≠ `in_progress` → **404** (nunca 415/413/422 → no filtra).

## Escenario 2 — Abrir la imagen (US2)

1. Como **supervisor** sobre la orden `pending_review`: `getOrderDetail` → `evidence.items:[{evidence_id,content_type}]`.
2. `GET /v1/orders/{id}/evidence/{evidence_id}` → **200** binario, con `X-Content-Type-Options: nosniff`, `Content-Type` real, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
3. Front: la imagen se renderiza desde un `blob:` (no hay URL firmada en el DOM/Referer/historial).
4. Como **dispatcher** → **404**. Sin sesión → **401**. `evidence_id` de otra orden → **404**.

## Escenario 3 — Seguridad y privacidad (US3)

- **Cifrado (SC-004)**: leer el objeto **crudo** del adaptador de almacenamiento (bypaseando el descifrado) → bytes **difieren** byte a byte del binario original subido (AES-256-GCM).
- **Firma interna (SC-003)**: la firma de lectura backend↔store caduca **≤300 s** (test de expiración); la respuesta/DOM **no** contiene ninguna URL/token de cliente.
- **Logs (SC-005)**: `grep` de logs de subida/lectura → **0** apariciones de `object_ref`/firma/binario.
- **Acceso directo (FR-006)**: pedir el objeto directamente al store sin la firma interna → denegado.
- **Auditoría**: cada lectura autorizada deja registro append-only (actor/orderId/evidenceId/timestamp, sin binario); los 401/404 emiten la señal best-effort heredada.

## Escenario 4 — Ciclo, retención y GC

- **Reenvío tras rechazo (FR-017)**: rechazar la orden → técnico **re-sube** fotos y reenvía → nuevo `attempt`; los `evidence_id` del ciclo anterior → **410** (autorizado, en alcance); el GC purga físicamente los blobs superados sin tocar los vigentes.
- **Staging abandonado (FR-024)**: subir sin enviar; avanzar el reloj/fixture > 24 h → el GC purga el blob huérfano; un submit posterior con ese ref → **422 «vuelve a subir»**.
- **Retención closed (FR-018/SC-006)**: orden `closed` con antigüedad > 90 d → el job purga el blob (verificar **ausencia física** en el store). Cualquier acceso a evidencia de `closed` → **404** (nunca 410).

## Comandos

```bash
make dev                      # levanta stack con HMR
make test-backend             # vitest backend (Postgres real; contract+integration+unit)
make test-frontend            # vitest + vitest-axe (front)
# contract tests: cubren operationId × código (201/401/404/413/415/422; 200/401/404/410; detalle+items)
```

**Criterio de aceptación global**: SC-001..SC-007 verdes; 100% contract tests; 0 regresiones; cobertura dominio/servicios ≥80%.
