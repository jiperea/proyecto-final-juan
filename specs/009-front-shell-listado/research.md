# Research — FE-1 · Front shell + acceso + listado

Decisiones técnicas para consumir contratos congelados desde una SPA React 18 + Vite, satisfaciendo los FR
de la spec. Formato: Decisión · Razón · Alternativas descartadas.

## R-01 · Enrutado de cliente → **React Router**

- **Decisión**: React Router con rutas `/login`, `/orders`, `/orders/:id` (clarificación de la spec) + una
  guarda de sesión que redirige a `/login` conservando el destino **en memoria/estado de router** (FR-021).
- **Razón**: back/forward nativo, deep-link (FR-021), foco de ruta al `h1` (FR-024), estándar de facto.
- **Alternativas**: estado interno sin URLs (descartado en clarify: rompe deep-link/back); TanStack Router
  (menos difundido, sin ventaja aquí).

## R-02 · Estado de servidor → **TanStack Query (React Query)**

- **Decisión**: TanStack Query para las lecturas (`getOrderList`, `getOrderDetail`, `me`): refetch-on-mount y
  control manual «Actualizar» (FR-009b/FR-011), dedup de peticiones idénticas, e **invalidación/purga de caché**
  al logout y al cambio de rol (FR-005/FR-029).
- **Razón**: resuelve de forma probada dedup, refetch, estados (loading/error) y purga de caché — justo los FR
  de robustez de sesión. Es una librería de **estado de datos**, no de componentes UI, así que no choca con
  "sin librería de componentes pesada" (Constitución §Convenciones).
- **Alternativas**: hooks `fetch` a mano (más código y riesgo en dedup/purga/race); SWR (equivalente, menor
  control de invalidación). El **dedup del refresh 401** NO se delega a la librería: es un interceptor propio
  (R-03) con promesa compartida, porque cruza todas las queries.

## R-03 · Cliente HTTP e interceptores → **wrapper `fetch` propio en `api/`**

- **Decisión**: un cliente `fetch` con: (a) inyección del access (memoria) en `Authorization`; (b) **CSRF
  double-submit** — lee cookie `csrf_token` y envía `X-CSRF-Token` en refresh/logout (FR-022); (c) manejo de
  **401 → refresh** con **promesa compartida única** (dedup, FR-004) y **reintento único** de las peticiones
  401 tras refresh; (d) **AbortController** atado al ciclo de vida de sesión para **descartar respuestas en
  vuelo** al logout/cambio de rol (FR-005/029); (e) `Cache-Control: no-store` en peticiones autenticadas y
  handler de **bfcache** (`pageshow` `persisted`) con blanqueo síncrono + revalidación (FR-030).
- **Razón**: estos comportamientos son transversales y de seguridad; deben vivir en una capa única (infra),
  testeable con MSW, no dispersos por las vistas.
- **Alternativas**: axios (interceptores cómodos, pero peso extra y `fetch` basta); lógica en cada hook
  (dispersa, difícil de testear y propensa a la race del refresh single-use).

## R-04 · Tipos y validación → **openapi-typescript (codegen) + Zod**

- **Decisión**: generar tipos TS desde `contracts/*.openapi.yaml` con **openapi-typescript** (script `codegen`)
  y validar las respuestas en el boundary con **Zod generado del mismo contrato** (p. ej. openapi-zod-client o
  script propio — **no Zod escrito a mano**, para evitar deriva silenciosa entre el tipo generado y el schema
  runtime; G2 F-005). El mismo `codegen` regenera tipos **y** Zod; el diff de CI cubre ambos. Un paso de CI **regenera y
  hace diff**: si los tipos comprometidos divergen del contrato, **falla** (FR-016/SC-008b). El mapa
  `status → badge` usa `satisfies Record<OrderStatus, …>` para fallar en compilación si falta un estado
  (FR-007/SC-008c).
- **Razón**: cumple "derivar del contrato, no reescribir a mano" de forma **verificable**, no aspiracional.
- **Alternativas**: escribir tipos a mano (prohibido por FR-016); orval/openapi-zod-client (generan cliente
  completo; más magia y acoplamiento del que necesitamos — nos basta tipos + Zod puntual).

## R-05 · Estilos y design system → **CSS Modules + tokens (CSS variables)**

- **Decisión**: tokens como **CSS custom properties** en `frontend/src/ui/tokens.css` (mapea `docs/design-system.md`);
  componentes con **CSS Modules**. Gates deterministas (FR-017/SC-008a): **stylelint**
  (`declaration-property-value-disallowed-list`) sobre CSS; regla **ESLint** contra `style={{}}` inline con
  literales; regla ESLint contra literales de color/tamaño en `.ts`/`.tsx` fuera de `ui/`.
- **Razón**: "tokens y CSS variables, sin librería de componentes pesada" (Constitución). Los tres lints cierran
  los tres vectores de estilo suelto detectados en el gate G1.
- **Alternativas**: Tailwind (utilidades ≈ estilos sueltos difíciles de gatear por token; y es "pesado" en
  clases); vanilla-extract (tipado, pero añade complejidad de build); librería de componentes (prohibida).

## R-06 · Testing → **Vitest + RTL + axe-core + Playwright + MSW**

- **Decisión**: Vitest + React Testing Library para interacción y los 4 estados de UI; **axe-core** por pantalla
  (SC-003, 0 violaciones serias/críticas); **Playwright** para navegación por teclado (SC-004), reflow a
  320px/zoom 200% (SC-007) y bfcache (FR-030); **MSW** para simular los contratos congelados (incl. 401/403/404/
  500/503) sin backend real. La verificación end-to-end contra el backend real (docker-compose) es la
  "definición de hecho" front+back+tests a la vez (quickstart).
- **Razón**: cubre los SC de FE-1 con herramientas deterministas; MSW deriva del contrato (contract-first en
  cliente). Sustituye a promptfoo, que no aplica sin IA/NL (reconciliación XIV en la spec).
- **Alternativas**: Cypress (equivalente a Playwright; Playwright integra mejor con Vite/CI y a11y); testear
  contra backend real en unit (lento, frágil — se reserva para E2E/quickstart).

## R-07 · Arranque de sesión y layout responsive

- **Decisión**: al arrancar/recargar → estado de carga + **refresh silencioso**; éxito → `me` (con un reintento
  si falla) → montar shell; fallo → login (FR-023). Layout: **campo (una columna)** para technician en cualquier
  ancho; **master-detail ≥1024px** para dispatcher/supervisor, con colapso/re-expansión al cruzar el breakpoint
  conservando la selección (FR-019/FR-025). Detección por CSS container/media queries + estado de layout.
- **Razón**: cumple persistencia de sesión (US1) sin token en storage y el patrón campo↔oficina del design
  system y la clarificación.
- **Alternativas**: SSR/Next (sobredimensiona; el backend ya sirve API, no necesitamos SSR); guardar sesión en
  storage (prohibido por FR-003).
