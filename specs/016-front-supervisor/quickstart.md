# Quickstart — validación de FE-4 (front del supervisor)

Front sobre el shell de FE-1. Se valida con Vitest + axe (determinista) y, opcional, un e2e del camino feliz.

## Local (determinista)
```bash
cd frontend
npm ci
npm run typecheck   # tsc strict + codegen:check (Zod↔contrato: ReviewRequest/IncidentSummaryResponse)
npm run lint        # eslint + stylelint (incl. "sin estilos sueltos", también el nuevo ConfirmDialog)
npm test            # Vitest + axe: ConfirmDialog, capa api review/summary, ReviewActions, IncidentSummaryPanel, integración
npm run build       # Vite
```

## Flujo a verificar (SC-001..006)
- **SC-001**: como `supervisor`, en una orden `pending_review` → **Aprobar** (confirmar en el alertdialog) → `closed` sin recarga; y **Rechazar** con motivo → `in_progress` sin recarga; la orden sale de la cola.
- **SC-002**: inyectar cada código de revisión (422 VALIDATION_ERROR/INVALID_REASON, 409 EVIDENCE_MISSING, 404, 403, 401, 500, 503) y de resumen (200 sufficient true/false, 429, 503, 500, 404/403/401) → mensaje de UI mapeado (ni crudo ni error boundary).
- **SC-003**: axe 0 violaciones en todos los estados nuevos (acciones, **alertdialog de confirmar**, motivo, panel IA vacío/cargando/con-resumen/sin-material/error, en vuelo, éxito); teclado (foco atrapado en el diálogo, retorno al cancelar); contraste ≥4.5:1/≥3:1; tap targets ≥44px.
- **SC-004**: technician/dispatcher no ven revisión ni panel IA; tampoco bajo el breakpoint de escritorio (aviso accesible en móvil); test que fuerza review/ai-summary con sesión no-supervisor → 403 manejado (backend = autoridad).
- **SC-005**: con `sufficient=false` la UI **nunca** muestra un resumen fabricado (decide por `sufficient`, no por el texto).
- **SC-006**: `reason`/`last_rejection_reason`/`summary` no aparecen en consola/telemetría/storage; validación de motivo (1..1000 code points ≥1 imprimible) antes de llamar al backend.

## Contra el stack real (opcional)
`docker compose up` + login como `supervisor1` / `SuperSecret123!` → abrir una orden en `pending_review` → pedir el resumen IA (proveedor `claude -p` en dev; puede responder `sufficient=false` si no hay material) → aprobar (con confirmación) o rechazar con motivo. (La faithfulness/no-PII del resumen la garantiza el backend 007.)
