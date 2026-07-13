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
  horizontal del body ni pérdida de función (reflow).
- **`prefers-reduced-motion`**: sin animaciones no esenciales.
- **Lista larga**: el listado usa la paginación por cursor que expone el backend (no carga ilimitada).

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
- **FR-004**: WHEN cualquier petición autenticada devuelve 401 THE app SHALL intentar **una** renovación vía
  refresh y, si falla, redirigir al login mostrando «Tu sesión ha caducado. Vuelve a iniciar sesión.».
- **FR-005**: WHEN el usuario activa «Cerrar sesión» THE app SHALL invocar el logout del contrato, descartar
  el access de memoria y volver al login.

**Listado por rol (US2)**

- **FR-006**: WHEN un usuario autenticado abre el listado THE app SHALL mostrar **exactamente** las órdenes
  que getOrderList devuelve para su rol, sin filtrar ni añadir en cliente, cada una con su badge de estado.
- **FR-007**: THE app SHALL renderizar el estado de cada orden con **color + etiqueta de texto en español**
  (nunca solo color) según el mapa de `docs/design-system.md §2.3`.
- **FR-008**: WHEN getOrderList devuelve una lista vacía THE app SHALL mostrar un estado «vacío» explicativo,
  distinguible del estado de carga y del de error.
- **FR-009**: WHEN getOrderList devuelve 503/500 THE app SHALL mostrar un estado de error con acción de
  reintento, sin colgar la vista.
- **FR-010**: WHEN getOrderList expone un cursor de paginación THE app SHALL cargar las páginas por cursor
  (no cargar la colección completa de una vez).

**Detalle read-only (US3)**

- **FR-011**: WHEN el usuario abre una orden de su ámbito THE app SHALL mostrar el detalle **solo-lectura**
  con los campos que getOrderDetail expone a su rol, **sin** controles de mutación.
- **FR-012**: WHEN el usuario es el technician dueño y hay un rechazo **sin atender** THE app SHALL mostrar
  el motivo del último rechazo; en otro caso THE app SHALL **omitir** ese bloque (no mostrar vacío).
- **FR-013**: WHEN getOrderDetail responde 404 (o el recurso está fuera del ámbito del rol) THE app SHALL
  mostrar el mensaje uniforme «Esta orden no existe o no está disponible para ti», idéntico entre roles.

**RBAC espejo y transversales**

- **FR-014**: THE app SHALL mostrar únicamente las vistas/acciones permitidas al rol autenticado (RBAC
  espejo); WHEN el backend responde 403/404 a una vista THE app SHALL degradar al estado «sin-permiso»/«no
  disponible» sin asumir jamás autoridad propia.
- **FR-015**: WHEN el backend devuelve un error del contrato `{code,...}` THE app SHALL mapearlo al mensaje
  español de `docs/design-system.md §8`, **sin inventar** texto no mapeado.
- **FR-016**: THE app SHALL derivar sus tipos y validaciones de entrada/salida del **contrato OpenAPI**
  (o del Zod derivado), no redefinir formas de datos ni enums de estado a mano.
- **FR-017**: THE app SHALL consumir tokens y componentes del design system (`frontend/src/ui/`) para todo
  color/tamaño/espaciado/tipografía; NO SHALL introducir hex/px/font arbitrarios en las vistas.
- **FR-018**: THE app SHALL ser operable **completamente por teclado** (foco visible, orden lógico, sin
  trampas de foco) en todas las vistas de FE-1.
- **FR-019**: THE app SHALL presentar layout de **campo** (una columna, objetivos táctiles ≥44px) por debajo
  de 640px y **master-detail** de oficina a partir de 1024px, sin scroll horizontal del body a ningún ancho.
- **FR-020**: THE app SHALL mostrar textos de cara al usuario en **español** manteniendo identificadores y
  código en inglés.

### Key Entities *(include if feature involves data)*

> FE-1 no crea entidades nuevas; **consume** las del contrato. Se listan como vistas de UI (read-only).

- **Sesión (vista)**: identidad del usuario autenticado — `userId`, nombre, `role`
  (technician|dispatcher|supervisor); access en memoria, refresh en cookie HttpOnly.
- **Orden — resumen de listado (vista)**: los campos que getOrderList expone por rol (id, título, estado,
  `created_at`, …). `draft`/`closed` no aparecen.
- **Orden — detalle (vista)**: los campos que getOrderDetail expone por rol (metadatos + `notes`/evidencia
  para technician/supervisor; `last_rejection_reason` solo al technician dueño con rechazo sin atender).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un usuario de cada rol completa el flujo «entrar → ver mis órdenes → abrir una → ver detalle»
  en **≤ 3 clics** desde el login (excluyendo la escritura de credenciales) y **sin callejones sin salida**.
- **SC-002**: El listado de cada rol muestra **el 100%** de las órdenes que el backend devuelve para ese rol
  y **0** de otros roles (verificado por test contra datos semilla; sin fugas entre roles).
- **SC-003**: **0 violaciones «serias» o «críticas» de axe-core** en cada pantalla de FE-1 (login, listado,
  detalle, y estados vacío/error/sin-permiso).
- **SC-004**: **100%** de las funciones de FE-1 son operables solo con teclado (foco visible, sin trampas),
  verificado por test de interacción.
- **SC-005**: Todos los pares texto/fondo y badges de estado usados cumplen contraste **WCAG 2.1 AA**
  (≥4.5:1 texto normal, ≥3:1 texto grande/estados), verificado por token contra `docs/design-system.md`.
- **SC-006**: Las vistas de datos (listado, detalle) presentan sus **cuatro** estados definidos —cargando,
  vacío, error, sin-permiso/no-disponible— sin quedar colgadas (verificado por test de cada estado).
- **SC-007**: A 320px de ancho y con zoom 200%, ninguna vista de FE-1 produce **scroll horizontal del body**
  ni oculta funciones (reflow AA).

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
| FR-004 | `refresh` | T0xx | `should refresh once then relogin on 401` |
| FR-005 | `logout` | T0xx | `should revoke session and return to login` |
| FR-006/007/008/009/010 | `getOrderList` | T0xx | `should render only role-scoped orders` / `empty` / `error` / `cursor paging` |
| FR-011/012/013 | `getOrderDetail` | T0xx | `should show role fields` / `owner sees rejection reason` / `uniform not-available` |
| FR-014/015 | (todos) | T0xx | `should mirror RBAC and map contract errors` |
| FR-016/017 | (contrato/DS) | T0xx | `types derived from contract` / `no loose styles (token lint)` |
| FR-018/019/020 | — | T0xx | `axe 0 serious` / `keyboard nav` / `reflow 320px` / `es labels` |

> Se mantiene en `docs/traceability.md` al cerrar el plan/tasks.

## Assumptions

- **Backend disponible y congelado**: 001 (auth+RBAC), 002a (getOrderList) y #010/008 (getOrderDetail) están
  mergeados y estables; FE-1 consume sus contratos tal cual (no los cambia).
- **Design system**: `docs/design-system.md` es la fuente de tokens/componentes; su implementación en
  `frontend/src/ui/` se crea en FE-1 (parte de esta feature).
- **Un solo idioma**: UI en español (i18n fuera de alcance, Constitution Convenciones).
- **Navegador moderno**: navegadores estándar actuales; sin soporte legacy (IE) — objetivo WCAG 2.1 AA.
- **Sin tema oscuro en MVP**: solo tema claro (tokens semánticos dejan la puerta abierta a futuro).
- **Fuera de alcance de FE-1** (van en FE-2/3/4): iniciar trabajo / registrar ejecución / captura de
  evidencia (FE-2), reasignación (FE-3), aprobar/rechazar + panel de resumen IA (FE-4). Ninguna mutación de
  órdenes en FE-1.
