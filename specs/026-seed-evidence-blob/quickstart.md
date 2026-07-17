# Quickstart — Verificación del seed con blob de evidencia (026)

Habilitador de **desarrollo**. Hace que la evidencia sembrada se sirva con 200 en el visor (025).

## Flujo de dev

```bash
make reset      # guard dev-local → prisma migrate reset --skip-seed → vaciar EVIDENCE_STORAGE_DIR → re-sembrar (blob incluido), todo en el contenedor backend
make dev        # levanta la app navegable (:5173 / :3001) contra db/fieldops
```

> **Requisito (D-002):** ejecutar `make reset`/`make up`/`make seed` **desde la raíz del repo con `docker-compose.override.yml` presente** (config de dev; `docker compose` lo fusiona por defecto → `NODE_ENV=development`, `db/fieldops`). Si se fuerza `docker compose -f docker-compose.yml …` (base, paridad-prod, `NODE_ENV=production`), el guard dev-local **aborta a propósito** (fail-closed): usa el flujo `make …` normal.

## Validación

1. **Evidencia sembrada visible (SC-001)**: como técnico dueño **o** supervisor, abrir el detalle de la orden ancla (`approvableReview`) y pulsar su evidencia → el visor (025) muestra **la imagen** (HTTP 200), no «Esta imagen ya no está disponible» (410). Equivalente en API: `GET /v1/orders/{ancla}/evidence/{evidence_id}` → 200 con el binario.
2. **Sin pasos manuales (SC-003)**: tras `make reset`/`make up` no hace falta exportar variables ni subir foto para ver esa evidencia.
3. **Reconexión del pool (H-210, a verificar aquí)**: con el backend en caliente, tras `make reset` una petición (`GET /v1/orders`) responde 200 sin reiniciar el contenedor. Si no reconectara: `docker compose restart backend` (fallback documentado).
4. **Guards (SC-002)** — deben **abortar sin escribir nada** (exit≠0, mensaje accionable):
   - `NODE_ENV=production … tsx prisma/seed.ts` → aborta (nombra `NODE_ENV=production`).
   - `DATABASE_URL=postgres://u:p@evil-db.example.com/x … seed` → aborta (nombra el hostname, **no** la URL con credenciales).
   - Sin `EVIDENCE_ENC_KEY` o `<32` → aborta (nombra `EVIDENCE_ENC_KEY` + acción).
5. **Idempotencia (FR-007/FR-011)**: `make reset` dos veces seguidas → mismo `object_ref` (content-addressed), un solo blob, sin huérfanos.
6. **Tests automatizados**: `cd backend && ./node_modules/.bin/vitest run <seed-evidence-blob>` (guard, blob 200 descifrable, object_ref determinista, idempotencia) + suite completa verde con su BD de test.

## Referencias

- Requisitos: [spec.md](./spec.md) (FR-001..FR-013, SC-001..SC-005).
- Decisiones: [research.md](./research.md).
- Visor que consume la evidencia: feature 025 (ya en develop).
