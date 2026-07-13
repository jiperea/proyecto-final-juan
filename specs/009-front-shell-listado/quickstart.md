# Quickstart — validar FE-1

Guía de validación end-to-end de FE-1 (shell + login + listado por rol + detalle read-only). La "definición de
hecho" (Constitución) exige **frontend + backend + tests en verde a la vez** en máquina limpia.

## Prerrequisitos

- Node 18+ · Docker + Docker Compose.
- Backend 001/002a/#010 disponible (contratos congelados). En dev, la BD y el backend se levantan por
  `docker compose` (paridad de entornos).

## Puesta en marcha (dev)

```bash
# 1. Backend + BD (paridad; sirve /v1)
docker compose up -d db backend

# 2. Frontend
cd frontend
npm ci
npm run codegen      # genera tipos desde contracts/*.openapi.yaml
npm run dev          # Vite; proxy /v1 → backend
# abrir http://localhost:5173
```

## Escenarios de validación (mapean a los SC/US)

1. **US1 · acceso** — entrar con un usuario semilla de cada rol; ver nombre y rol en el shell; recargar (la
   sesión persiste vía refresh silencioso, FR-023); forzar expiración del access → renovación transparente;
   logout → vuelta a login y **estado purgado** (FR-005).
2. **US2 · listado por rol** — technician ve solo sus activas; supervisor `pending_review`; dispatcher
   `assigned/in_progress`; cuenta sin órdenes → estado «vacío» con mensaje de ámbito; backend caído (503) →
   estado de error con «Reintentar»; sin scroll horizontal a 320px.
3. **US3 · detalle read-only** — abrir una orden del ámbito; technician dueño con rechazo sin atender ve el
   motivo; dispatcher no ve notas/evidencia; id fuera de ámbito → mensaje uniforme «no disponible».
4. **A11y/responsive** — navegación completa por teclado; foco al `h1` al cambiar de ruta; skip-link; master-
   detail ≥1024px (dispatcher/supervisor) y una columna (technician); reflow a 320px y zoom 200%.

## Comandos de test (deben quedar en verde)

```bash
cd frontend
npm test              # Vitest + RTL (interacción, 4 estados, RBAC espejo, mapeo de errores) con MSW
npm run test:a11y     # axe-core por pantalla → 0 violaciones serias/críticas (SC-003)
npm run test:e2e      # Playwright: teclado (SC-004), reflow 320/zoom200 (SC-007), bfcache (FR-030)
npm run lint          # stylelint + eslint: 0 estilos sueltos (SC-008a) · sin inline/const de estilo
npm run typecheck     # tsc strict + diff de codegen vs contrato (SC-008b/c)
```

Detalle de operaciones consumidas y códigos en [contracts/README.md](./contracts/README.md); tipos/estado en
[data-model.md](./data-model.md); decisiones técnicas en [research.md](./research.md).
