# Implementation Plan: Visor ampliado de evidencia (lightbox + carrusel)

**Branch**: `025-evidence-viewer-lightbox` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-evidence-viewer-lightbox/spec.md`

## Summary

Feature **solo frontend** (presentación) que añade un **visor ampliado** de evidencia al detalle de orden: al activar un tile de evidencia (técnico o supervisor) se abre un modal `role=dialog` a tamaño completo con la imagen real, y un **carrusel** (anterior/siguiente + indicador «k de N») cuando la orden tiene varias. Reutiliza el flujo fetch→blob existente (`getOrderEvidence` vía `apiFetchBlob`/`useOrderEvidence`) sin exponer la URL del endpoint en el DOM, y el patrón de modal accesible ya presente en el design system (`ConfirmDialog`: focus-trap, Esc, retorno de foco, solo tokens). **No toca backend, contrato, RBAC, endpoint ni seed** (autorización server-authoritative heredada exacta de 024). El habilitador de seed (US3) se descopó a una spec propia en G1.

## Technical Context

**Language/Version**: TypeScript 5 strict · React 18 + Vite (frontend)

**Primary Dependencies**: React, TanStack Query (`useOrderEvidence`), design system propio (`src/ui/*`, tokens.css). **Sin** librerías externas de lightbox/modal ni de focus-trap (se reutiliza el patrón de `ConfirmDialog`).

**Storage**: N/A (no persiste nada; consume blobs vía object URL en memoria, revocados al cerrar/cambiar).

**Testing**: Vitest + React Testing Library + `vitest-axe` (a11y). Tests de componente con `getOrderEvidence` **mockeado** (fixture de `items[]`), sin backend real ni seed.

**Target Platform**: Navegador (SPA); viewports objetivo 360 px (campo/móvil) y 1280 px (oficina).

**Project Type**: Web app hexagonal — esta feature toca **solo `frontend/`**.

**Performance Goals**: Apertura del visor percibida como inmediata; sin animación con `prefers-reduced-motion` (0 ms). Reutiliza la caché de blob de TanStack Query cuando el tile ya lo cargó.

**Constraints**: 0 hex/px/tipografía sueltos (solo tokens); axe 0 violaciones; sin scroll horizontal a 360/1280 px; controles ≥44×44 px; foco atrapado + retorno.

**Scale/Scope**: 1 componente de visor (lightbox+carrusel) + wiring en el detalle; ~2 historias (US1/US2), 14 FR, 5 SC.

## Constitution Check

*GATE: front-only; los gates de contrato/RBAC/hexagonal aplican al backend, que esta feature NO toca (FR-012).*

### Gate · Contract-First (Principio II)

- [x] **N/A justificado**: no hay endpoints nuevos ni cambios de contrato. Reutiliza `getOrderEvidence` e `items[]` de `getOrderDetail` (contrato de 024, ya verificado). Tipos de UI derivados de los schemas existentes (`schemas.ts`), no redefinidos.

### Gate · RBAC y seguridad (Principios IV, IX, XI)

- [x] **Sin RBAC nueva**: autorización server-authoritative heredada exacta (backend decide visibilidad; el front solo pinta lo autorizado). FR-012.
- [x] 401 delegado al cliente HTTP existente (`apiFetch` refresh/logout); 410/404/red → mensaje genérico **sin fuga** de código/detalle (FR-005). Distinción de estados heredada de 024.
- [x] PII: no se expone la URL del endpoint en el DOM (FR-002); object URLs revocados (FR-013); no se persiste ni loguea el binario.
- [x] Auditoría: la lectura de evidencia ya la audita el backend (024); el visor no añade superficie.

### Gate · Arquitectura Hexagonal (Principio III)

- [x] **N/A** (front). Respeta `docs/front-architecture.md`: tipos derivados del contrato, estado de servidor con TanStack Query, «token o nada».

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)

- [x] FRs en EARS; trazabilidad RF→tarea→test en la spec y `docs/traceability.md`.
- [x] **TDD fase Red**: tests de componente + axe en rojo antes de implementar el visor.
- [x] SC medibles con herramientas deterministas (axe 0 violaciones, stylelint/eslint 0 sueltos) + tests de UI. Gates G1 (✅ PASS) / G2 / G3 previstos.

> **Sin violaciones**: los gates de backend son N/A por ser feature de presentación (patrón idéntico a 022/023). No se rellena Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/025-evidence-viewer-lightbox/
├── plan.md              # Este fichero
├── research.md          # Decisiones de diseño (Phase 0)
├── quickstart.md        # Guía de validación (Phase 1)
├── checklists/requirements.md
└── gates/               # G1 (PASS)
# data-model.md y contracts/ OMITIDOS: feature de presentación, sin entidades ni endpoints nuevos.
```

### Source Code (repository root) — solo `frontend/`

```text
frontend/src/
├── ui/
│   ├── ConfirmDialog.tsx        # patrón de modal a REUTILIZAR (focus-trap/Esc/retorno/tokens)
│   ├── tokens.css · components.css   # tokens + clases .dialog/.dialog-overlay (extender para el visor)
│   └── index.ts
├── features/orders/
│   ├── EvidenceViewer.tsx       # NUEVO — lightbox + carrusel (role=dialog, backdrop cierra, nav ←/→)
│   ├── EvidenceTile.tsx         # MODIF — el tile activa el visor (en vez de pintar la img incrustada)
│   ├── OrderDetailView.tsx      # MODIF — orquesta el visor sobre items[]; estado por orden (FR-014)
│   ├── useOrders.ts             # useOrderEvidence (reutilizado; carga por evidence_id)
│   └── ...
├── i18n/errors.ts               # REUTILIZA mensajes (messageForCode('EVIDENCE_GONE'), OFFLINE_MESSAGE, FALLBACK_MESSAGE)
└── api/client.ts                # apiFetchBlob (reutilizado)

frontend/tests|src/**/__tests__/  # NUEVO — EvidenceViewer.test.tsx (RTL + vitest-axe, getOrderEvidence mockeado)
```

**Structure Decision**: Web app hexagonal; esta feature vive **solo en `frontend/src/`**. El componente nuevo `EvidenceViewer` encapsula el overlay+carrusel; `EvidenceTile` pasa de «pintar la imagen incrustada» a «ser el disparador que abre el visor en su posición»; `OrderDetailView` mantiene el estado de apertura/índice, y el reset entre órdenes lo da el **remount existente** (`key={orderId}` en `OrdersView`) — sin lógica de reset manual; el visor revoca sus object URLs al desmontar (FR-014). Se extienden las clases `.dialog`/`.dialog-overlay` de `components.css` (o se añaden `.evidence-viewer*`) usando solo tokens.

## Complexity Tracking

> Sin violaciones de la Constitution que justificar (feature de presentación, backend intacto). Tabla vacía.
