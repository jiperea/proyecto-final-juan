# Quickstart — validación de FE-2 (front del técnico)

Front sobre el shell de FE-1. Se valida con Vitest + axe (determinista) y, opcional, un e2e del camino feliz.

## Local (determinista)
```bash
cd frontend
npm ci
npm run typecheck   # tsc strict + codegen:check (aserción Zod↔contrato)
npm run lint        # eslint + stylelint
npm test            # Vitest + axe (unit/componente): capa api, EvidencePicker, ExecutionForm, integración
npm run build       # Vite
```

## Flujo a verificar (SC-001..006)
- **SC-001**: orden propia `assigned` → *Iniciar* → `in_progress` en la misma pantalla (sin recarga).
- **SC-002**: `in_progress` → notas + ≥1 foto → *Enviar* → `pending_review` (e2e camino feliz; sin textos de ayuda extra).
- **SC-003**: inyectar cada error (422 INVALID_TRANSITION/EVIDENCE_REQUIRED/INVALID_EVIDENCE/VALIDATION_ERROR,
  404, 403, 401) → mensaje de UI mapeado (ni error crudo ni error boundary).
- **SC-004**: axe sin violaciones; teclado; aria-busy en Iniciar/Enviar; cada evidencia con nombre accesible y
  eliminar por teclado; tap targets ≥44px.
- **SC-005**: `object_ref` (UUID) valida contra el contrato antes de añadirse.
- **SC-006**: notas/object_ref no aparecen en logs/errores/telemetría.

## Contra el stack real (opcional)
`docker compose up` (backend+db) + `VITE_BACKEND_ORIGIN` → login como `technician1` / `SuperSecret123!` →
iniciar y ejecutar una orden asignada. (El binario de la foto no se sube — deuda #007; el metadato sí viaja.)
