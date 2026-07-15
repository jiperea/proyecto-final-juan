# Arquitectura y buenas prácticas del front (FieldOps)

> **Propósito**: dar al front la misma gobernanza que la constitution da al backend. El backend tiene
> arquitectura codificada (hexagonal, `Result/Either`, contract-first); el front tenía una estructura *de
> facto* razonable pero sin documentar ni reglas. Este documento **formaliza lo que ya existe** y fija reglas
> de React **con su porqué**, endurecidas por eslint donde es proporcionado (Constitution XV).
>
> La **fuente de verdad** sigue siendo la constitution (`.specify/memory/constitution.md`); esto la refleja
> para el front, no la redefine. Feature **FE-6 / 020-front-architecture**.

## 1. Estructura por capas

El front (`frontend/src/`) se organiza en estas capas. Para cada una: **qué es** y **qué NO va aquí**.

| Capa | Responsabilidad | Qué **NO** va aquí |
|------|-----------------|--------------------|
| **`features/`** (`auth`, `orders`, `shell`) | Vistas y componentes por dominio funcional: el JSX de cada pantalla y sus subcomponentes, agrupados por *feature*. | Llamadas HTTP crudas (van en `api/`), literales de estilo (van en `ui/`/tokens), tipos de API redefinidos a mano. |
| **`ui/`** (kit propio) | Componentes base reutilizables (Button, Stepper, ThemeToggle, MasterDetail, estados…) y **tokens** (`tokens.css`). Único lugar con literales de color/tamaño/tipografía. | Lógica de negocio, llamadas a la API, dependencia de un *feature* concreto. |
| **`api/`** (cliente + hooks) | El cliente HTTP (`client.ts`: `apiFetch`, `ApiError`) y los **hooks de TanStack Query** (`use*`, `*-api.ts`) que encapsulan queries/mutations y el estado de servidor. | Render/JSX, decisiones de presentación. Es la **única** capa que llama a `apiFetch`. |
| **`i18n/`** | Textos de UI en **español** y mensajes de error mapeados por código. | Identificadores/nombres de código (en inglés), lógica. |
| **tipos del contrato** (`src/api/generated`) | Tipos **derivados** del OpenAPI (contract-first), regenerados, no editados a mano. | Tipos de API escritos a mano (serían una fuente de verdad paralela). |

**Regla transversal de dependencias**: las vistas (`features/`) consumen datos **a través de los hooks de
`api/`**, no del cliente directamente; `ui/` no depende de `features/` ni de `api/`; los tipos salen del
contrato. Esto es el espejo, en el front, de la disciplina de capas del backend hexagonal.

## 2. Reglas de React (con su porqué y su nivel de enforcement)

Cada regla lleva un **nivel**: `enforced` (eslint da error), `recomendación` (documentada, no bloqueante) o
`guía` (juicio humano, no mecanizable). Los niveles los fijó el **baseline** (§3). Cada regla tiene **un
único nivel primario** (el de su cabecera, FR-002a); cuando una regla `guía` tiene además una parte
mecanizada por otra regla (p. ej. (b) por `exhaustive-deps`, (d) por FR-017c), se indica en su cuerpo, sin
que eso cambie su nivel primario.

### (a) Separación presentacional vs contenedor — `guía`
Un componente que *pinta* (presentacional: recibe props, no sabe de dónde vienen) debe separarse del que
*orquesta* (contenedor: usa hooks, decide qué datos pedir). El porqué: los presentacionales son triviales de
testear y reutilizar, y el acoplamiento a la fuente de datos queda aislado en un solo sitio. No es
mecanizable de forma fiable por lint (es un juicio de diseño), así que queda como guía verificada en revisión.

### (b) La lógica vive en hooks `use*`, no en el JSX — nivel: `guía`
El *fetching*, el estado, los *side-effects* y las reglas de negocio de UI se extraen a hooks `use*`; el
componente se queda con el render. El porqué: mantiene los componentes legibles y la lógica testeable de
forma aislada, y evita efectos enredados en el árbol JSX. La parte **mecanizable** —que los hooks declaren
**todas** sus dependencias— se hace cumplir con `react-hooks/exhaustive-deps` a nivel **error** (§3).

### (c) Estado de servidor siempre con TanStack Query — `guía`
Nada de `fetch` suelto en componentes: el estado de servidor se gestiona con los hooks de `api/` (TanStack
Query), cubriendo **explícitamente** los estados de **carga / error / vacío / sin-permiso**. Sobre los
códigos de error, la UI **refleja el que envía el backend** y distingue **401** (sesión caducada →
reautenticar), **403** (sin permiso) y **404** (no encontrado). **Excepción de anti-enumeración (seguridad)**:
enmascarar la existencia de un recurso es decisión del **backend** — para lecturas/mutaciones de un recurso
concreto (p. ej. detalle de una orden, reasignar/revisar por `orderId`) el backend puede devolver **404 en
vez de 403**, y el front **respeta ese 404 tal cual, sin reconstruir un 403 distinto** (patrón ya
implementado en `OrderDetailView`/`useOrderMutations`, a preservar). No es un único lint rule, por eso es guía.

### (d) Componentes base propios en `ui/` consumiendo tokens — nivel: `guía`
Sin librería de componentes pesada: si falta una pieza, se crea como base en `ui/` consumiendo tokens y se
reutiliza. El porqué: control total del look accesible y del bundle, y coherencia con el design system. La
parte mecanizable (cero literales de estilo fuera de `ui/`) ya la hace cumplir la regla FR-017c.

### (e) "Token o nada" — `enforced` (ya activo, FR-017c)
Cero colores/tamaños/tipografías **literales** fuera de `src/ui/`: todo sale de tokens. El porqué: un único
punto de verdad visual permite el tema claro/oscuro y los cambios globales sin cazar literales dispersos. Se
hace cumplir con `no-restricted-syntax` (literales de color/px/fuente) + stylelint, ya en verde.

### (f) Accesibilidad WCAG 2.1 AA — nivel: `enforced`
Contraste (texto ≥4.5:1, grande/componentes ≥3:1), roles/labels correctos, foco visible y navegación por
teclado. El porqué: es requisito del brief y de la constitution, y no negociable para el usuario de campo. La
parte automatizable la cubre `jsx-a11y/recommended` (ya activo) + los tests de ratio de token; el resto
(orden de foco, textos alternativos con sentido) se revisa a mano.

### (g) Sin default exports — `enforced` (nuevo, baseline 0)
Todo módulo usa **named exports**. El porqué: los *named exports* dan renombrado seguro, autoimportación
fiable y evitan dos nombres para el mismo símbolo; es además el espejo de la disciplina del backend
(`no default exports`). Se hace cumplir con `no-restricted-syntax` (`ExportDefaultDeclaration`) en `src/`.
**Excepción**: los ficheros de configuración de tooling (`vite/vitest/playwright.config.ts`) **requieren**
default export por contrato del framework y quedan fuera del alcance de la regla (no son código de app).

### (h) RBAC en UI espejo del backend — `guía` (seguridad)
La UI **refleja** el control de acceso (muestra/oculta según rol y estado) pero **NUNCA es la fuente de
autorización**: el backend es el **único** que autoriza (rol + `assigned_to` + estado de origen) y **rechaza
aunque se fuerce la petición** (Constitution IV). Ocultar o deshabilitar un control es **UX, no un control de
seguridad**. El porqué: confiar en el ocultamiento del cliente sería una vía directa de escalada de
privilegios. No es mecanizable por lint; es una doctrina de diseño de obligado cumplimiento en revisión.

### (i) Responsive campo↔oficina + `prefers-reduced-motion` — `guía`
Móvil para el técnico en campo, *master-detail* de escritorio (≥1024px) para dispatcher/supervisor; sin
scroll horizontal del body; se respeta `prefers-reduced-motion`. El porqué: el mismo producto sirve a dos
contextos de uso muy distintos y debe ser cómodo y accesible en ambos. Se verifica con e2e/responsive y
revisión, no con una única regla de lint.

### (j) Límite de importación entre capas — `enforced` (nuevo, baseline 0)
Las vistas/componentes **no importan `apiFetch`** (el cliente HTTP) directamente: consumen datos vía los
hooks de `api/`. El porqué: mantiene el estado de servidor en una sola capa (cacheo, reintentos, estados) y
evita llamadas crudas dispersas por la UI, igual que el dominio del backend no habla con Prisma
directamente. Se hace cumplir con `no-restricted-imports` (solo `apiFetch`; el **tipo** `ApiError` sí se
permite para manejo de errores). La capa de datos (`src/api/**`, `*-api.ts`, `use*`) queda exenta: es su
responsabilidad legítima.

## 3. Baseline (2026-07-15) y clasificación

Método (FR-003a): cada regla mecanizable se corrió contra `frontend/src` con la config del front; se contó
con `git diff --numstat` (líneas = añadidas+eliminadas; ficheros de producción, excl. `src/api/generated`/
tests/fixtures). Umbral: `enforced` si verde o ≤3 ficheros/≤10 líneas; si no, `recomendación`.

| Regla | Mecanismo eslint | Violaciones en `src/` | Nivel |
|-------|------------------|----------------------|-------|
| (g) sin default exports | `no-restricted-syntax` (`ExportDefaultDeclaration`) | **0** | `enforced` |
| (b) deps de hooks | `react-hooks/exhaustive-deps: error` | **0** | `enforced` |
| (j) límite de capas | `no-restricted-imports` (`apiFetch`) | **0** | `enforced` |
| (e) token o nada | `no-restricted-syntax` (FR-017c) + stylelint | 0 (ya activo) | `enforced` |
| (f) a11y | `jsx-a11y/recommended` | 0 (ya activo) | `enforced` parcial |
| (a),(c),(d parcial),(h),(i) | — (no mecanizables) | n/a | `guía` |

**Resultado: 3 reglas nuevas `enforced` con 0 fixes de producción** (el front ya era conforme). Sin
degradaciones a `recomendación` ni `eslint-disable` (cupo usado: **0/3**). Ámbito de las reglas (g)/(j):
`src/` (los config files de tooling y los tests quedan fuera; ver excepción en (g) y el override de la capa
de datos en (j)).

## 4. Inventario de ficheros RBAC-sensibles (invariante conservador, FR-008a)

Esta feature **no modifica lógica de control de acceso**. Ficheros con lógica de rol/visibilidad conocidos
(regla **fail-safe**: ante la duda, tratar como RBAC-sensible):

- `src/features/orders/OrderDetailView.tsx`, `src/features/orders/useOrderMutations.ts` (403↔404 anti-enum.)
- `src/features/orders/ReviewActions.tsx`, `ReassignForm.tsx`, `StartWorkButton.tsx` (acciones por rol/estado)
- `src/features/orders/OrderList.tsx` (alcance por rol), guarda de rutas / `session` (sesión y rol)

**Red de seguridad complementaria (S-004)**: además del inventario, se corre un grep de patrones RBAC
(`role`/`assignedTo`/`status`/`permission`/`useAuth`/`useSession`) sobre el diff final; si tocara un fichero
no listado, se reclasifica. El criterio **primario y suficiente** es el **nodo AST** completo (un fix que solo
toque las deps de un `useEffect` con lógica de rol en su cuerpo queda cubierto). Como no se modifica lógica
RBAC, no se requirió snapshot de tests. Cualquier `eslint-disable` sobre lógica RBAC se anotaría aquí como
**deuda** (crear/reparar el test de rol y retirar la exención). En esta feature: **ninguno**.

## 5. Enforcement demostrado (FR-007)

`frontend/tests/lint-fixtures/` contiene un snippet "malo" por regla `enforced` nueva; el test
`frontend/tests/lint-fixtures.test.ts` los linta programáticamente (API de ESLint) y **asserta que producen
error**. El directorio está excluido del run principal de eslint (solo ese directorio). Así el enforcement
está **demostrado**, no solo declarado.

## 6. Mantenimiento (sincronía doc↔config, FR-010)

Cada regla etiquetada `enforced` en este documento existe como **error** en `frontend/.eslintrc.cjs`; la
comprobación la verifica un test de gobernanza. Al añadir/quitar reglas de lint en el futuro, actualizar
**ambos** (este doc y la config) en el mismo cambio.

## Anexo — Coordinación con features futuras

**021-front-dual-accent** (siguiente feature de front) puede tocar los mismos componentes; se asume orden de
merge **020→021** para que 021 salga de un `develop` con estas reglas ya activas (garantía de proceso/roadmap,
no de estos gates). El conjunto de reglas (a)–(j) es el **acordado inicialmente** para cerrar la brecha con el
backend, no exhaustivo; convenciones adicionales (error boundaries, memoización de listas, etc.) se tratan
como deuda de una feature futura.
