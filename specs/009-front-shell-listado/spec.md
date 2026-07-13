# Feature Specification: FE-1 · Front shell + acceso + listado (read-only)

**Feature Branch**: `009-front-shell-listado`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "FE-1 · Front shell + acceso + listado (read-only). Primera UI del proyecto:
aplicación web responsive (React 18 + Vite) que consume los contratos ya congelados (auth.openapi.yaml,
orders.openapi.yaml) y el design system propio (docs/design-system.md)."

> **Naturaleza de la feature.** FE-1 es la **primera UI** del proyecto. Es *read-side* puro desde la
> perspectiva del usuario (entrar, ver, abrir); **no muta órdenes** (eso es FE-2/3/4). Consume
> **contratos ya congelados** — no introduce endpoints nuevos — y el **design system** `docs/design-system.md`.
> La autoridad de acceso es del **backend** (001/002a/#010); la UI hace **RBAC espejo** (oculta lo que el
> rol no puede), nunca sustituye la comprobación del servidor.

## Clarifications

### Session 2026-07-14

- Q: ¿Modelo de navegación de la SPA? → A: Rutas de cliente con URLs enlazables (`/login`, `/orders`,
  `/orders/:id`), back/forward nativo del navegador (habilita el deep-link ya especificado).
- Q: ¿Layout del technician en pantalla ancha? → A: Campo-first — el technician usa **una columna**
  (lista→detalle) en cualquier ancho; **master-detail** (≥1024px) solo para dispatcher/supervisor.
- Q: ¿Patrón de paginación del listado? → A: **Ninguno.** El contrato de `getOrderList` declara
  explícitamente *"Sin paginación"* (`orders.openapi.yaml`, `OrderListResponse` solo expone `orders[]`, sin
  cursor). La app renderiza la lista completa que devuelve el backend. (Corrige la asunción inicial de
  cursor/«Cargar más»; detectado en gate G1 B-01.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrar y saber quién soy (Priority: P1)

Como usuario de FieldOps (technician, dispatcher o supervisor) quiero **iniciar sesión** con mis
credenciales, ver **quién soy y mi rol**, y **cerrar sesión**, de modo que la app sepa qué puedo ver.
Si mi sesión caduca, la app me devuelve a la pantalla de acceso sin perder mi sitio de forma abrupta.

**Why this priority**: Sin acceso no hay app. Es la base sobre la que se apoyan el listado (US2) y el
detalle (US3). Entregada sola ya es demostrable ("entro, la app me reconoce, salgo").

**Independent Test**: Con el backend 001 en marcha, un usuario semilla inicia sesión, ve su nombre y rol
en el shell, recarga (la sesión persiste vía refresh), fuerza la expiración del access y es devuelto al
login sin pantalla rota; luego cierra sesión y vuelve al login.

**Acceptance Scenarios**:

1. **Given** un usuario no autenticado en la pantalla de acceso, **When** introduce credenciales válidas y
   envía, **Then** entra al shell y ve su nombre y rol (technician/dispatcher/supervisor).
2. **Given** credenciales inválidas, **When** envía el formulario, **Then** ve el mensaje en español
   «Credenciales no válidas» **sin** revelar si el fallo fue usuario o contraseña, y permanece en el login.
3. **Given** una sesión activa, **When** el access token expira y una petición devuelve 401, **Then** la app
   intenta renovar con el refresh; si falla, devuelve al login mostrando «Tu sesión ha caducado…».
4. **Given** una sesión activa, **When** el usuario pulsa «Cerrar sesión», **Then** se revoca la sesión en el
   backend, el access se descarta de memoria y vuelve al login.

---

### User Story 2 - Ver mis órdenes por rol (Priority: P1)

Como usuario autenticado quiero ver **la lista de órdenes de mi ámbito** (las que mi rol puede ver) para
saber en qué trabajar, con un estado visible por cada orden.

**Why this priority**: Es el corazón del "veo mis órdenes por rol" del roadmap y el brief. Junto a US1
completa el MVP mínimo demostrable de la fase Front.

**Independent Test**: Con datos semilla, cada rol inicia sesión y ve **exactamente** las órdenes que el
backend (getOrderList) devuelve para su ámbito, ni más ni menos, con su badge de estado correcto; una
cuenta sin órdenes en ámbito ve el estado «vacío».

**Acceptance Scenarios**:

1. **Given** un technician autenticado, **When** abre el listado, **Then** ve solo **sus** órdenes activas
   (assigned/in_progress/pending_review), ordenadas como las devuelve el backend, cada una con su estado.
2. **Given** un supervisor autenticado, **When** abre el listado, **Then** ve las órdenes en
   `pending_review` de su ámbito.
3. **Given** un dispatcher autenticado, **When** abre el listado, **Then** ve las órdenes en
   `assigned`/`in_progress` de su ámbito.
4. **Given** un rol cuyo ámbito no tiene órdenes, **When** abre el listado, **Then** ve un estado «vacío»
   explicativo, no una lista en blanco ambigua ni un error.
5. **Given** el backend no disponible (503) o error (500), **When** se carga el listado, **Then** ve un
   estado de error con opción de reintento, no una pantalla colgada.

---

### User Story 3 - Abrir el detalle de una orden (solo lectura) (Priority: P2)

Como usuario autenticado quiero **abrir una orden** desde el listado y ver su **detalle solo-lectura** con
los campos que mi rol puede ver, para entender su situación. Como technician dueño, si mi orden fue
rechazada y aún no la he retomado, quiero ver el **motivo del último rechazo** para poder corregir.

**Why this priority**: Completa el "abro una" del demostrable y habilita el bucle de calidad (el técnico
lee por qué le rechazaron). Depende de US1+US2 pero es un slice testeable aparte.

**Independent Test**: Desde el listado, el usuario abre una orden y ve el detalle con los campos de su rol
(getOrderDetail); un technician con una orden rechazada sin atender ve el motivo; un dispatcher **no** ve
notas/evidencia; abrir un id fuera de ámbito muestra el mensaje uniforme «no disponible».

**Acceptance Scenarios**:

1. **Given** un usuario en el listado, **When** abre una orden de su ámbito, **Then** ve el detalle
   solo-lectura con los campos que el contrato expone a su rol.
2. **Given** un technician dueño de una orden con un rechazo **sin atender**, **When** abre su detalle,
   **Then** ve el **motivo del último rechazo**; si no hay rechazo pendiente, ese bloque no aparece.
3. **Given** un dispatcher, **When** abre el detalle de una orden, **Then** **no** ve `notes` ni metadatos
   de evidencia (mínimo privilegio), sin que la ausencia se presente como error.
4. **Given** un id inexistente o fuera del ámbito del rol, **When** se intenta abrir el detalle, **Then** ve
   el mensaje **uniforme** «Esta orden no existe o no está disponible para ti» (no distingue 403 de 404, no
   filtra existencia entre roles).

---

### Edge Cases

- **Sesión caducada durante navegación**: cualquier 401 en una vista dispara el flujo de renovación/relogin
  de US1, no un error genérico por pantalla.
- **Deep-link a una orden sin sesión**: abrir una URL de detalle sin sesión lleva al login y, tras entrar,
  al recurso pedido (si es de su ámbito) o al mensaje uniforme de «no disponible».
- **Cambio de rol/permisos entre peticiones**: si el backend responde 403/404 a una vista que la UI mostró,
  la UI degrada al estado «sin-permiso»/«no disponible» sin romperse.
- **Pantalla estrecha (≥320px) y zoom 200%**: el contenido y las acciones siguen accesibles sin scroll
  horizontal del body ni pérdida de función (reflow) — ver FR-019/SC-007.
- **`prefers-reduced-motion`**: sin animaciones no esenciales — ver FR-028.
- **Lista larga**: `getOrderList` no pagina (contrato); la app renderiza la lista completa devuelta. Si el
  volumen se volviera un problema, sería una enmienda del contrato de 002a, fuera del alcance de FE-1.
- **Refresh concurrente**: varios 401 simultáneos comparten una única renovación (FR-004); el refresh es
  single-use y no debe dispararse dos veces.
- **Fallo de red sin respuesta HTTP** (offline/timeout): estado de error con reintento (FR-027), distinto de
  un 5xx servido por el backend.
- **Recarga de página (F5)**: el access vive solo en memoria; el arranque intenta refresh silencioso
  (FR-023) antes de decidir shell vs login.
- **Dispositivo compartido (tablet de cuadrilla)**: al cerrar sesión se purga todo el estado cliente
  (FR-005) para que el siguiente usuario no vea datos residuales.

## Requirements *(mandatory)*

> **EARS OBLIGATORIO (Constitution V).** Comportamiento **observable de la UI**. FE-1 no define lógica de
> servidor: cada FR es verificable con test de componente/interacción (RTL/Playwright) o de accesibilidad
> (axe-core) contra el contrato congelado.

### Functional Requirements

**Acceso y sesión (US1)**

- **FR-001**: WHEN un usuario envía credenciales válidas en el formulario de acceso THE app SHALL
  autenticarlo contra el contrato de auth y mostrar el shell con su nombre y rol.
- **FR-002**: WHEN el envío de credenciales falla la autenticación (401) THE app SHALL mostrar el mensaje
  español «Credenciales no válidas» sin revelar cuál campo falló y permanecer en el login.
- **FR-003**: THE app SHALL mantener el access token **solo en memoria** (no en localStorage/sessionStorage)
  y apoyarse en el refresh en cookie HttpOnly para la persistencia de sesión (ADR-0002).
- **FR-004**: WHEN una petición autenticada devuelve 401 THE app SHALL intentar **una** renovación vía
  refresh, **deduplicando** las renovaciones concurrentes en una **única promesa compartida** (el refresh es
  single-use con rotación atómica; nunca debe dispararse dos veces en paralelo); si la renovación tiene éxito
  THE app SHALL **reintentar automáticamente una sola vez cada una** de **todas** las peticiones que
  recibieron 401 (no solo la que disparó el refresh — relevante en master-detail con listado+detalle
  concurrentes); si la renovación falla, **o** si una petición reintentada vuelve a 401 (no reintentar en
  bucle), THE app SHALL redirigir al login mostrando «Tu sesión ha caducado.
  Vuelve a iniciar sesión.» y **conservar la ruta pedida** (en memoria/estado de router, nunca en storage
  compartido) para reanudarla tras el re-login.
- **FR-005**: WHEN el usuario activa «Cerrar sesión» THE app SHALL invocar el logout del contrato (con CSRF
  double-submit, FR-022), descartar el access de memoria, **purgar todo el estado en memoria/caché del
  cliente** (listado, detalle, `notes`, `last_rejection_reason`, identidad) y navegar al login; WHEN la
  llamada de logout falla por **cualquier** motivo (red, 401 sesión ya revocada, 403 CSRF, 5xx) THE app SHALL
  **igualmente** limpiar el estado local y navegar al login (best-effort, no bloquea al usuario). THE app
  SHALL **descartar toda respuesta en vuelo** al momento del logout (abortar/atar al ciclo de vida de la
  sesión) para que ninguna respuesta tardía repueble el estado tras la purga.
- **FR-022**: WHEN la app invoca un endpoint protegido por cookie (`refresh`, `logout`) THE app SHALL leer la
  cookie `csrf_token` (legible por JS) y enviarla en la cabecera `X-CSRF-Token` (double-submit), conforme al
  contrato de auth (orden de comprobación server-side: sesión 401 **antes** que CSRF 403).
- **FR-023**: WHEN arranca o se recarga la app THE app SHALL mostrar un estado de carga e intentar un
  **refresh silencioso**; si tiene éxito THE app SHALL montar el shell (identidad vía `me`); si falla THE app
  SHALL mostrar el login; tras un re-login THE app SHALL continuar a la ruta solicitada (el destino pendiente
  se guarda **en memoria/estado de router**, nunca en storage compartido). WHEN el refresh silencioso tiene
  éxito pero la llamada a `me` falla (red/timeout/5xx) THE app SHALL reintentar `me` una vez y, si vuelve a
  fallar, mostrar el login (nunca quedar en carga indefinida).

**Listado por rol (US2)**

- **FR-006**: WHEN un usuario autenticado abre el listado THE app SHALL mostrar **exactamente** las órdenes
  que getOrderList devuelve para su rol, sin filtrar ni añadir en cliente, cada una con su badge de estado.
- **FR-007**: THE app SHALL renderizar el estado de cada orden con **color + etiqueta de texto en español**
  (nunca solo color) según el mapa de `docs/design-system.md §2.3`. El mapa `status → {etiqueta, color}`
  SHALL ser **exhaustivo contra el enum `OrderStatus` derivado del contrato** (p. ej. `satisfies
  Record<OrderStatus, …>`), de modo que la compilación **falle** si el contrato añade un estado sin badge.
- **FR-008**: WHEN getOrderList devuelve una lista vacía THE app SHALL mostrar un estado «vacío» con un
  mensaje **no genérico** que indique que no hay órdenes en el ámbito del rol (p. ej. «No tienes órdenes
  asignadas» / «No hay órdenes en revisión»), distinguible del estado de carga y del de error.
- **FR-009**: WHEN getOrderList devuelve 503/500 THE app SHALL mostrar un estado de error con acción de
  reintento, sin colgar la vista.
- **FR-009b**: WHEN el usuario entra o vuelve a la vista de listado (montaje de ruta) THE app SHALL
  **revalidar** (refetch) los datos, y SHALL ofrecer un control manual de **«Actualizar»**. El listado **no
  es tiempo real** (sin polling); se asume que dispatcher/supervisor lo refrescan al actuar (ver Assumptions).
- **FR-010**: THE app SHALL renderizar la **lista completa** que devuelve getOrderList; `getOrderList` **no
  pagina** (contrato), luego NO SHALL implementar control de paginación ni cursor en cliente.

**Detalle read-only (US3)**

- **FR-011**: WHEN el usuario abre una orden de su ámbito THE app SHALL mostrar el detalle **solo-lectura**
  con los campos que getOrderDetail expone a su rol, **sin** controles de mutación. THE app SHALL renderizar
  los campos opcionales (`notes`, `evidence`, `last_rejection_reason`) **estrictamente por presencia** en el
  payload (nunca los fabrica ni infiere); la autoridad de qué campos llegan por rol es del backend (ya
  testeado en #010). NO SHALL comprobar ownership en cliente como sustituto de esa autoridad. THE app SHALL
  revalidar el detalle al montar la ruta y ofrecer un control manual de **«Actualizar»** (análogo al listado,
  FR-009b), para refrescar `last_rejection_reason` sin salir y reentrar.
- **FR-011b**: THE app SHALL renderizar `notes` y todo texto libre autorado por otro usuario como **texto
  escapado**; NO SHALL usar HTML crudo, `dangerouslySetInnerHTML` ni markdown sin sanitizar (anti-XSS
  almacenado entre roles).
- **FR-012**: WHEN el usuario es el technician dueño y hay un rechazo **sin atender** THE app SHALL mostrar
  el motivo del último rechazo (si `last_rejection_reason` viene en el payload); en otro caso THE app SHALL
  **omitir** ese bloque (no mostrar vacío).
- **FR-013**: WHEN getOrderDetail responde 404 (o el recurso está fuera del ámbito del rol) THE app SHALL
  mostrar el mensaje uniforme «Esta orden no existe o no está disponible para ti», idéntico entre roles.
- **FR-013b**: WHEN getOrderDetail devuelve 503/500 THE app SHALL mostrar un estado de error con acción de
  reintento (análogo a FR-009), sin colgar la vista. (El estado «vacío» no aplica al detalle: es un único
  recurso.)

**RBAC espejo y transversales**

- **FR-014**: THE app SHALL mostrar únicamente las vistas/acciones permitidas al rol autenticado (RBAC
  espejo, no autoritativo); WHEN el backend responde 403/404 a una vista THE app SHALL degradar al estado
  «sin-permiso»/«no disponible».
- **FR-015**: WHEN el backend devuelve un error del contrato `{code,...}` cuyo `code` está en la tabla de
  `docs/design-system.md §8` THE app SHALL mostrar ese mensaje español; WHEN el `code` **no** está en la
  tabla (o la respuesta no trae `code`) THE app SHALL mostrar el **mensaje genérico de fallback** de §8
  («Ha ocurrido un error. Reinténtalo.»). NO SHALL improvisar texto fuera de §8.
- **FR-016**: THE app SHALL **generar** sus tipos y validaciones desde el contrato OpenAPI (codegen, p. ej.
  openapi-typescript + Zod derivado), no escribirlos a mano; un **test/paso de CI SHALL fallar si los tipos
  de la UI divergen del contrato** (no basta con que coincidan hoy).
- **FR-017**: THE app SHALL consumir tokens y componentes del design system (`frontend/src/ui/`) para todo
  color/tamaño/espaciado/tipografía; NO SHALL introducir hex/px/font arbitrarios en las vistas, **verificado
  por un lint determinista** que **falla en CI** ante un estilo suelto, cubriendo **los tres vectores**:
  (a) stylelint (`declaration-property-value-disallowed-list`) sobre CSS/CSS-in-JS; (b) regla ESLint sobre
  `style={{…}}` con literales **inline en JSX/TSX**; y (c) regla ESLint que prohíbe literales de color/tamaño
  (hex/px/font) en constantes/helpers `.ts`/`.tsx` **fuera de** `frontend/src/ui/` (tokens), para que no se
  cuelen indirectados por una variable.
- **FR-018**: THE app SHALL ser operable **completamente por teclado** (foco visible, orden lógico, sin
  trampas de foco) en todas las vistas de FE-1.
- **FR-019**: THE app SHALL presentar al **technician** un layout de **campo** (una columna, lista→detalle)
  en **cualquier** ancho; WHEN el rol es dispatcher o supervisor y el ancho es ≥1024px THE app SHALL
  presentar **master-detail** (lista + detalle), colapsando a una columna por debajo. **Todo** control
  interactivo (en cualquier layout/rol) SHALL cumplir objetivo táctil **≥44×44px** (design-system §4). THE
  app SHALL evitar scroll horizontal del body a cualquier ancho.
- **FR-021**: THE app SHALL exponer rutas de cliente enlazables (`/login`, `/orders`, `/orders/:id`) con
  back/forward del navegador; WHEN se abre una ruta protegida sin sesión THE app SHALL llevar al login y,
  tras autenticar, continuar al recurso pedido (o al mensaje uniforme de «no disponible» si está fuera de
  ámbito). El destino pendiente SHALL guardarse **en memoria/estado de router, nunca en storage compartido**
  (misma restricción que FR-004/FR-023, para las tres rutas de reanudación).
- **FR-020**: THE app SHALL mostrar textos de cara al usuario en **español** manteniendo identificadores y
  código en inglés.
- **FR-024**: WHEN cambia la ruta de cliente THE app SHALL mover el foco al encabezado principal (`h1`) de la
  vista destino (comportamiento único y verificable; la live region queda para las transiciones **sin** cambio
  de ruta de FR-031).
- **FR-025**: WHEN el layout es master-detail (dispatcher/supervisor ≥1024px) y la ruta es `/orders` sin id
  THE app SHALL mostrar en el panel de detalle un placeholder («Selecciona una orden»); WHEN se selecciona
  una fila THE app SHALL navegar a `/orders/:id` conservando la lista visible y mover el foco al panel de
  detalle. NO SHALL hacer **prefetch** de getOrderDetail de órdenes no seleccionadas explícitamente. WHEN el
  ancho cruza por debajo de 1024px con un detalle abierto THE app SHALL colapsar a la **vista de detalle**
  con un control visible de **retorno a la lista** (no perder el detalle ni dejar la lista sin salida); WHEN
  el ancho vuelve a cruzar por encima de 1024px THE app SHALL re-expandir a master-detail **conservando la
  orden seleccionada**.
- **FR-026**: WHILE una vista de datos (listado/detalle) está cargando THE app SHALL marcar su región con
  `aria-busy` y ofrecer texto de carga para tecnologías de asistencia.
- **FR-027**: WHEN una petición falla **sin respuesta HTTP** (offline/timeout de fetch) THE app SHALL mostrar
  el estado de error con reintento y el mensaje «Sin conexión. Reinténtalo.» (design-system §8).
- **FR-028**: WHEN el usuario tiene `prefers-reduced-motion` activo THE app SHALL desactivar las
  transiciones/animaciones no esenciales.
- **FR-029**: WHEN un refresh (silencioso o por 401) devuelve un `role` distinto al de la sesión en memoria
  (el contrato de auth relee el rol de BD al rotar) THE app SHALL actualizar la identidad, **purgar/invalidar
  la caché** de listado y detalle del ámbito anterior, **descartar las respuestas en vuelo** bajo el rol
  viejo, y **re-montar el shell** (layout campo↔oficina + RBAC espejo + listado) bajo el rol nuevo; WHEN la
  vista actual queda fuera del nuevo ámbito THE app SHALL degradar a «no disponible». (Misma purga que FR-005;
  aplica también a la degradación por 403/404 de FR-014.)
- **FR-030**: THE app SHALL solicitar las respuestas autenticadas con `Cache-Control: no-store` y, WHEN una
  vista se restaura desde bfcache (`pageshow` con `persisted`), SHALL **blanquear de inmediato (síncrono) el
  contenido restaurado** (overlay opaco) **antes** de revalidar la sesión, y luego revalidar; si no hay
  sesión, ir al login — para que en dispositivo compartido el botón «atrás» **nunca** muestre, ni un instante,
  datos del usuario anterior.
- **FR-031**: WHEN una vista de datos pasa de «cargando» a «error»/«vacío» **sin cambio de ruta** THE app
  SHALL anunciar el nuevo contenido vía live region (`role="status"` para vacío, `role="alert"` para error)
  para usuarios de lector de pantalla.
- **FR-032**: THE app SHALL proveer un **skip-link** «Saltar al contenido» y estructurar el shell con
  landmarks (`<header>`/`<nav>`/`<main>`) para no obligar a re-tabular el chrome persistente en cada vista
  (WCAG 2.4.1).

### Key Entities *(include if feature involves data)*

> FE-1 no crea entidades nuevas; **consume** las del contrato. Se listan como vistas de UI (read-only).

- **Sesión (vista)**: identidad del usuario autenticado — `userId`, nombre, `role`
  (technician|dispatcher|supervisor); access en memoria, refresh + `csrf_token` en cookies.
- **Orden — resumen de listado (vista)**: conjunto **cerrado** de campos del schema `Order` (idéntico para
  todos los roles; el RBAC decide **qué órdenes**, no qué campos): `id`, `title`, `description`, `status`,
  `assigned_to` (UUID opaco o `null`, **sin nombre/PII**), `version`, `created_at`, `updated_at`.
  `draft`/`closed` nunca aparecen en el listado.
- **Orden — detalle (vista)**: `order` (mismo `Order` de arriba) **+** campos opcionales que el backend
  **omite** (nunca `null`) según rol/estado: `notes` (string; solo technician dueño/supervisor), `evidence`
  (`{count, content_types[]}`; solo technician dueño/supervisor; puede venir vacío `{count:0,...}`),
  `last_rejection_reason` (string saneado; solo technician dueño **actual** con rechazo sin atender). Sin PII
  cruda ni `object_ref`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un usuario de cada rol completa el flujo «entrar → ver mis órdenes → abrir una → ver detalle»
  en **≤ 3 clics** desde el login (excluyendo la escritura de credenciales). Además, **toda vista de FE-1
  expone un control de retorno visible/navegable** a listado o login (0 vistas sin salida), verificado por
  test de interacción.
- **SC-002**: El listado de cada rol muestra **el 100%** de las órdenes que el backend devuelve para ese rol
  y **0** de otros roles (verificado por test contra datos semilla; sin fugas entre roles).
- **SC-003**: **0 violaciones «serias» o «críticas» de axe-core** en cada pantalla de FE-1 (login, listado,
  detalle, y estados vacío/error/sin-permiso).
- **SC-004**: **100%** de las funciones de FE-1 son operables solo con teclado (foco visible, sin trampas),
  verificado por test de interacción.
- **SC-005**: Todos los pares texto/fondo y badges de estado usados cumplen contraste **WCAG 2.1 AA**
  (≥4.5:1 texto normal, ≥3:1 texto grande/estados), verificado por token contra `docs/design-system.md`.
- **SC-006**: Las vistas de datos presentan sus estados definidos sin quedar colgadas (verificado por test de
  cada estado): el **listado** —cargando, vacío, error, sin-permiso—; el **detalle** —cargando, error,
  no-disponible— (el estado «vacío» no aplica al detalle, que es un único recurso).
- **SC-007**: A 320px de ancho y con zoom 200%, ninguna vista de FE-1 produce **scroll horizontal del body**
  ni oculta funciones (reflow AA).
- **SC-008**: El pipeline de FE-1 falla en CI ante **(a)** un estilo suelto (hex/px/font fuera de token — via
  stylelint en CSS **y** regla ESLint sobre `style={{}}` inline en JSX, FR-017), **(b)** una divergencia entre
  los tipos de la UI y el contrato OpenAPI (codegen + test de diff — FR-016), o **(c)** un `status` del enum
  sin badge (exhaustividad tipada — FR-007). Los tres gates deterministas en verde.

> **Verificación de SC (reconciliación XIV).** FE-1 **no tiene componente IA/NL**, luego sus SC se codifican
> como **tests deterministas de front** (Vitest + Testing Library para interacción/estados; **axe-core** para
> a11y; Playwright para teclado/reflow si el plan lo adopta), no como evals de promptfoo. promptfoo queda
> reservado para SC con IA/lenguaje natural (ninguno en FE-1). El gate G3 de FE-1 exige esta suite en verde.

## Contrato (OpenAPI) — consumo, no definición *(Constitution II)*

FE-1 **no introduce endpoints nuevos ni modifica** los contratos; los **consume** congelados:

- **`contracts/auth.openapi.yaml`** — login, identidad (`me`), refresh, logout. Roles: los tres.
- **`contracts/orders.openapi.yaml`** — `getOrderList` (listado por rol) y `getOrderDetail` (#010, detalle
  read-side por rol; 404 uniforme sin 403; `last_rejection_reason` solo al technician dueño).

Reglas de consumo (verificadas por `revisor-front-a11y-ux` y `revisor-consistencia`):

- Tipos/enums de la UI **derivados** del contrato (o del Zod derivado); prohibido reescribir formas de datos.
- Errores mapeados por `code` a mensajes español (`docs/design-system.md §8`); nada inventado.
- Ningún campo/estado asumido que el contrato no exponga al rol.

## Trazabilidad (RF → endpoint → tarea → test) *(Constitution VI)*

| FR | Endpoint(s) consumido(s) | Tarea(s) | Test(s) |
|----|--------------------------|----------|---------|
| FR-001/002/003 | `login`, `me` | T0xx | `should enter shell with role when credentials valid` / `should show generic error on 401` |
| FR-004/022/029 | `refresh` | T0xx | `dedupe concurrent refresh` / `retry original request once after refresh` / `login (no loop) on repeated 401` / `send X-CSRF-Token on refresh` / `re-mount shell on role change` |
| FR-005/022 | `logout` | T0xx | `revoke+purge client state → login` / `best-effort on any failure (net/401/403/5xx)` / `discard in-flight responses` / `send X-CSRF-Token on logout` |
| FR-023/030 | `refresh`, `me` | T0xx | `silent-refresh on boot → shell or login` / `resume route after relogin` / `no-store + revalidate on bfcache pageshow` |
| FR-006/007/008/009/009b/010 | `getOrderList` | T0xx | `render only role-scoped orders` / `exhaustive status→badge (compile fail if missing)` / `role-specific empty message` / `error+retry` / `refetch on mount + manual refresh` / `full list, no pagination` |
| FR-011/011b/012/013/013b | `getOrderDetail` | T0xx | `role fields by presence` / `escapes notes (no raw html)` / `owner sees rejection reason` / `uniform not-available` / `detail error 500/503` |
| FR-014/015 | (todos) | T0xx | `mirror RBAC and map contract errors` / `generic fallback for unmapped code` |
| FR-016/017 | (contrato/DS) | T0xx | `codegen types diverge → CI fails` / `loose style CSS+inline JSX → lint fails` |
| FR-018/019/024/025/026/031/032 | — | T0xx | `keyboard nav` / `technician single-column` / `master-detail ≥1024 + focus on select` / `collapse to detail on resize` / `44px all layouts` / `focus to h1 on route change` / `no prefetch` / `aria-busy loading` / `live-region on state change` / `skip-link + landmarks` |
| FR-020/021/027/028 | — | T0xx | `es labels` / `deep-link → login → resource (in-memory)` / `network fail → sin conexión` / `reduced-motion off` / `reflow 320px` |

> Se mantiene en `docs/traceability.md` al cerrar el plan/tasks.

## Assumptions

- **Backend disponible y congelado**: 001 (auth+RBAC), 002a (getOrderList) y #010/008 (getOrderDetail) están
  mergeados y estables; FE-1 consume sus contratos tal cual (no los cambia).
- **Design system**: `docs/design-system.md` es la fuente de tokens/componentes; su implementación en
  `frontend/src/ui/` se crea en FE-1 (parte de esta feature).
- **Un solo idioma**: UI en español (i18n fuera de alcance, Constitution Convenciones).
- **Navegador moderno**: navegadores estándar actuales; sin soporte legacy (IE) — objetivo WCAG 2.1 AA.
- **Sin tema oscuro en MVP**: solo tema claro (tokens semánticos dejan la puerta abierta a futuro).
- **Listado no es tiempo real**: se revalida al montar la vista y con un control manual «Actualizar»
  (FR-009b); no hay polling ni push. Dispatcher/supervisor deben refrescar para ver mutaciones de otros roles
  (reasignación/aprobación de FE-3/4). Tiempo real es candidato de fase posterior, no del MVP.
- **Fuera de alcance de FE-1** (van en FE-2/3/4): iniciar trabajo / registrar ejecución / captura de
  evidencia (FE-2), reasignación (FE-3), aprobar/rechazar + panel de resumen IA (FE-4). Ninguna mutación de
  órdenes en FE-1.

**Disposiciones conscientes del gate G1 (medias diferidas con motivo, Principio XV — no ampliar el slice):**

- **Logout multi-pestaña**: NO se propaga entre pestañas en FE-1. Se acepta que otra pestaña siga operando
  con su access en memoria hasta su siguiente 401 (que disparará relogin). Endurecer (`BroadcastChannel`) es
  candidato de una fase posterior; no bloquea el MVP. (Gate G1 M-10.)
- **Telemetría/monitorización de errores en cliente**: FE-1 **no** integra ningún servicio de telemetría de
  terceros. Si se añadiera, deberá **redactar PII y datos de orden** antes de salir del navegador. (M-13.)
- **Defensa en profundidad de render por rol**: la autoridad de qué campos llegan por rol es del **backend**
  (#010, ya testeado); la UI renderiza **estrictamente por presencia** (FR-011) y no re-verifica ownership en
  cliente (evitaría más de lo que oculta y duplica lógica del servidor). Decisión de diseño, no omisión.
  (M-11.)
