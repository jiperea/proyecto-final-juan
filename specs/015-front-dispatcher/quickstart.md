# Quickstart — validación de FE-3 (front del dispatcher)

Front sobre el shell de FE-1. Se valida con Vitest + axe (determinista) y, opcional, un e2e del camino feliz.

## Local (determinista)
```bash
cd frontend
npm ci
npm run typecheck   # tsc strict + codegen:check (aserción Zod↔contrato)
npm run lint        # eslint + stylelint (incl. "sin estilos sueltos")
npm test            # Vitest + axe (unit/componente): capa api reassign, ReassignForm, integración por rol/viewport
npm run build       # Vite
```

## Flujo a verificar (SC-001..005)
- **SC-001**: como `dispatcher`, en una orden `assigned`/`in_progress` → introducir un **UUID de técnico conocido** (fuera de banda) + motivo → *Reasignar* → nuevo `assigned_to` reflejado **sin recarga**, estado sin cambio (e2e camino feliz).
- **SC-002**: inyectar cada error (404 genérico, `VALIDATION_ERROR`, `INVALID_ASSIGNEE`, `FORBIDDEN_ROLE`, 401, **500**, **red/transporte**) → mensaje de UI mapeado (ni crudo ni error boundary).
- **SC-003**: axe 0 violaciones en los estados nuevos; teclado; foco+anuncio (`aria-live=polite` que nombra el destino) en éxito **y** error; contraste ≥4.5:1/≥3:1 (con comprobación dirigida a disabled/focus); tap targets ≥44px.
- **SC-004**: el control de reasignar **no** es visible para technician/supervisor ni por debajo del breakpoint de escritorio (`useWideViewport`); el backend sigue siendo la autoridad.
- **SC-005**: `reason`/`assignee_id` no aparecen en consola, telemetría ni storage (espía de consola + storage); validación de cliente (UUID RFC 4122 v1–v5 con `trim`; motivo 1..500 ≥1 imprimible) rechaza antes de llamar al backend; **ambos** errores a la vez.

## Contra el stack real (opcional)
`docker compose up` (backend+db) + `VITE_BACKEND_ORIGIN` → login como `dispatcher1` → abrir una orden reasignable e introducir el UUID de un técnico válido (obtenido del roster/seed) + motivo → reasignar. (El selector de técnicos con nombre no existe aún — deuda de backend registrada; la entrada es manual.)
