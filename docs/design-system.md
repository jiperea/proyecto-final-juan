# Design System — FieldOps

> **Estatus:** especificación transversal. Se crea **al llegar la primera UI** (FE-1), como manda la
> constitución (Convenciones §Sistema de diseño). Los specs de UI (FE-1..4) **consumen** estos tokens y
> componentes; **no los redefinen**. La implementación en código vive en `frontend/src/ui/` (CSS
> variables + componentes base) y se materializa en FE-1.
>
> **Reglas duras (constitución):** sin estilos sueltos (nada de hex/px/font arbitrarios en las vistas;
> todo sale de un token), **sin librería de componentes pesada** (los componentes base son propios),
> accesibilidad objetivo **WCAG 2.1 AA**, textos de UI **en español**, identificadores/código en inglés.

---

## 1. Principios

1. **Contract-first en la UI.** Los tipos, enums y formularios se **derivan** del contrato
   (`contracts/*.openapi.yaml` → Zod). La UI no reinventa formas de datos ni estados.
2. **RBAC espejo, no sustituto.** La UI oculta/deshabilita lo que el rol no puede hacer, pero la
   **autoridad es del backend**. Ocultar un botón no es seguridad (lo verifica `revisor-rbac-seguridad`).
3. **Campo ↔ oficina.** Móvil primero para el técnico en campo (una mano, sol, red pobre); escritorio
   *master-detail* para dispatcher/supervisor. Un mismo componente, dos densidades.
4. **Token o nada.** Cualquier color/tamaño/espaciado/tipografía se referencia por token semántico.
5. **El color nunca es el único portador de significado** (WCAG 1.4.1): estado = color **+ texto** (+
   icono opcional).

---

## 2. Tokens de color

Nombres de token = variables CSS (`--color-*`). Los valores son el **contrato de la paleta**; una vista
que necesite un color usa el token semántico, nunca el hex.

### 2.1 Base (neutros)

| Token | Valor (light) | Uso |
|---|---|---|
| `--color-bg` | `#ffffff` | Fondo de página |
| `--color-surface` | `#f8fafc` | Tarjetas, paneles |
| `--color-border` | `#cbd5e1` | Bordes, separadores (≥3:1 con surface) |
| `--color-text` | `#1e293b` | Texto principal (≈13:1 sobre bg ✓ AAA) |
| `--color-text-muted` | `#475569` | Texto secundario (≈7:1 ✓ AA) |
| `--color-text-on-accent` | `#ffffff` | Texto sobre superficies de color fuerte |

### 2.2 Semánticos (acción y feedback)

| Token | Valor | Contraste | Uso |
|---|---|---|---|
| `--color-primary` | `#c2410c` (naranja) | blanco sobre él ≈5.2:1 ✓ | Acción principal, enlaces, **texto** de acento (≥4.5:1) |
| `--color-primary-hover` | `#9a3412` | — | Estado hover/active |
| `--color-accent-vivid` (FE-7) | `#dc5a24` claro / `#ff7a45` oscuro | ≥3:1 vs bg/surface/surface-2 (2 temas) | **Acento VIVO del artifact — SOLO superficies SIN texto** (anillo de foco, punto del Stepper, borde de selección). **Nunca bajo texto** (con blanco ≈3.4:1 < 4.5): ahí va `--color-primary`. |
| `--color-accent-soft` | `#fff1e9` | — | Tinte suave del acento (fondos sutiles) |
| `--color-danger` | `#b91c1c` | blanco ≈6:1 ✓ | Rechazar, destructivo, error |
| `--color-success` | `#15803d` | blanco ≈5:1 ✓ | Aprobar, éxito |
| `--color-warning-fg` | `#92400e` | sobre bg ≈6:1 ✓ | Texto de aviso |
| `--color-focus-ring` | `var(--color-accent-vivid)` | ≥3:1 con adyacentes | Anillo de foco (2px sólido + `outline-offset` ≥2px, visible) |

> **Nota AA:** todos los pares texto/fondo declarados cumplen ≥4.5:1 (texto normal) o ≥3:1 (texto grande
> ≥18.66px bold / 24px, y bordes/estados de foco). Cualquier token nuevo **debe** validarse antes de
> entrar (herramienta determinista: axe-core en test, ver §7).

### 2.3 Estado de la orden (badge)

Los 5 estados del FSM. **Siempre** badge = tinte de fondo + **etiqueta de texto en español** (color no
único). El técnico solo ve activas; `draft`/`closed` no aparecen en listado pero el detalle puede
mostrar `closed`.

| Estado (code) | Etiqueta UI | `--status-*-bg` | `--status-*-fg` |
|---|---|---|---|
| `assigned` | «Asignada» | `#dbeafe` | `#1e40af` |
| `in_progress` | «En curso» | `#fef9c3` | `#854d0e` |
| `pending_review` | «En revisión» | `#ede9fe` | `#5b21b6` |
| `closed` | «Cerrada» | `#dcfce7` | `#166534` |
| `draft` | «Borrador» | `#f1f5f9` | `#334155` |

> Todos los pares `fg`/`bg` de badge cumplen ≥4.5:1. `draft` se documenta por completitud aunque el
> contrato no lo exponga a ningún rol en listado/detalle.

### 2.4 Tema oscuro (FE-5 / 017)

**Incluido desde FE-5** (decisión del usuario, 2026-07-15; reescribe la exención previa "fuera del MVP").
Modelo **CSS-first**, sin doble fuente de verdad ni JS de render:

- `:root` define los valores **claros**.
- `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { … } }` → sigue al SO en modo «sistema»
  (sin JS; reacciona solo al cambio del SO).
- `:root[data-theme="dark"]` / `:root[data-theme="light"]` → **elección del usuario** (gana sobre el SO).
- **Precedencia:** elección del usuario (`data-theme`) > `prefers-color-scheme` > claro.

El cambio de tema es un **swap de variables CSS en `:root`** (no remonta componentes → conserva el foco).
El **conmutador** (`ThemeToggle`, §6) persiste la elección en `localStorage` (clave `fieldops.theme`,
valores `light|dark|system`); en «sistema» borra la clave. Un **script inline anti-FOUC** en `index.html`
aplica `data-theme` antes del primer pintado (misma clave que `ui/theme.ts` — fuente de verdad única).

**Contraste AA en ambos temas** verificado por `tests/a11y/contrast-tokens.test.ts` (lista cerrada de
pares × claro/oscuro). Valores oscuros (extracto): `--color-bg #0e141a`, `--color-surface #18212b`,
`--color-text #e7edf3`, `--color-text-muted #aab8c7`, acento `--color-primary #fb923c` con
`--color-text-on-accent #1a1005`, `--color-accent-vivid #ff7a45` (foco/Stepper/selección),
`--color-focus-ring var(--color-accent-vivid)`; estados con fondos tenues + texto claro.

---

## 3. Tipografía

Fuente del sistema (sin descarga de webfont → rendimiento y offline en campo):
`font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;`

| Token | Tamaño / peso / interlineado | Uso |
|---|---|---|
| `--font-display` | 28px / 700 / 1.2 | Título de pantalla |
| `--font-h2` | 20px / 600 / 1.3 | Sección |
| `--font-body` | 16px / 400 / 1.5 | Texto (nunca <16px en campo) |
| `--font-label` | 14px / 600 / 1.4 | Etiquetas de formulario, badges |
| `--font-caption` | 13px / 400 / 1.4 | Metadatos (fecha, versión) |

> Mínimo 16px en cuerpo para legibilidad en móvil al sol y para no forzar zoom (evita disparadores de
> reflow WCAG 1.4.10). Escalable con `rem`; respeta el zoom del navegador hasta 200%.

---

## 4. Espaciado, radios, elevación, motion

- **Espaciado** (escala 4px): `--space-1:4` `--space-2:8` `--space-3:12` `--space-4:16` `--space-6:24`
  `--space-8:32`. Nada de píxeles sueltos.
- **Radios (FE-5, más suaves):** `--radius-sm:9px` `--radius-md:14px` `--radius-full:9999px` (badges/avatar).
- **Elevación:** `--shadow-1` (tarjeta) y `--shadow-2` (panel/menú), **sombras suaves de dos capas**, no color.
- **Objetivo táctil:** todo control interactivo **≥44×44px** (WCAG 2.5.5 / campo con guantes).
- **Motion:** transiciones ≤200ms; **respeta `prefers-reduced-motion`** (sin animación si el usuario lo
  pide).

---

## 5. Responsive — campo ↔ oficina

Breakpoints (mobile-first):

| Token | Ancho | Persona / layout |
|---|---|---|
| base | `<640px` | **Campo (técnico):** una columna, tarjetas, acciones grandes al alcance del pulgar |
| `--bp-md` | `≥640px` | Tablet: una columna ancha |
| `--bp-lg` | `≥1024px` | **Oficina (dispatcher/supervisor):** *master-detail* (lista izquierda + detalle derecha) |

- **Técnico:** flujo vertical, formulario de ejecución + captura de evidencia optimizados para móvil.
- **Dispatcher/supervisor:** lista maestra a la izquierda, detalle/acciones a la derecha en `≥lg`; en
  móvil colapsa a navegación lista→detalle (push).
- Sin scroll horizontal del body a ningún ancho; tablas anchas scrollan dentro de su contenedor.

---

## 6. Inventario de componentes base (`frontend/src/ui/`)

Componentes propios (sin librería pesada). Cada uno documenta su API de props y sus estados a11y en FE-1.

| Componente | Nota a11y clave | Consumido por |
|---|---|---|
| `Button` (primary/secondary/danger) | rol `button`, foco visible, ≥44px, `disabled` real | Todas |
| `TextField` / `TextArea` | `<label>` asociado, error vía `aria-describedby`, `aria-invalid` | Login, ejecución, rechazo |
| `Select` | teclado nativo, label | Reasignación (destino) |
| `StatusBadge` | color **+ texto** (§2.3), no solo color | Lista, detalle |
| `OrderCard` (<1024px, incl. tablet `md`) / `OrderRow` (≥1024px, tabla) | tarjeta enfocable, título como enlace; el umbral de cambio es `--bp-lg` (1024px), coherente con master-detail | Listado |
| `MasterDetail` | landmarks (`<nav>`/`<main>`), foco al navegar | Oficina |
| `FileInput` (evidencia) | label, feedback de subida, alt/validación | Ejecución (técnico) — FE-2 |
| `Toast` / `InlineError` | `role="status"`/`role="alert"` según urgencia | Todas |
| `EmptyState` / `Spinner` | texto, no solo icono; `aria-busy` | Estados de carga/vacío |
| `Modal` (confirmación rechazo con motivo) | foco atrapado, `Esc` cierra, restaura foco | Revisión — FE-4 |
| `SkipLink` («Saltar al contenido») | visualmente oculto salvo con foco de teclado; usa `--color-focus-ring`/`--space-*`; salta a `<main>` (WCAG 2.4.1) | Shell (todas) |
| `Stepper` (FE-5) | `<ol>` del ciclo de vida (5 estados); `aria-current="step"` en el actual; estado por color **+ texto** «(actual/completado/pendiente)»; presentación pura (props) | Detalle de orden |
| `ThemeToggle` (FE-5) | grupo de botones (claro/oscuro/sistema) con `aria-pressed`; foco visible; sin datos de negocio; persiste en `localStorage` | Shell (todas) |
| `BackToList` («Volver a la lista») | control de retorno visible al colapsar master-detail <1024px; foco al activar; ≥44px; texto español; tokens de `ui/` (no estilos sueltos) | MasterDetail colapsado (FE-1) |

**Estados obligatorios de toda vista de datos:** *cargando · vacío · error · sin-permiso*. Un endpoint que
puede devolver 404/409/503 tiene su estado de UI definido; nada se queda colgado.

---

## 7. Accesibilidad — criterio medible (WCAG 2.1 AA)

Gate de a11y (verificable, no subjetivo — lo exige `auditor-spec-theater` y lo vigila
`revisor-front-a11y-ux`):

- **0 violaciones «serias» o «críticas» de axe-core** en cada pantalla (test automatizado en CI).
- **Navegación completa por teclado**: toda función operable sin ratón; foco visible (`--color-focus-ring`);
  sin trampas de foco; orden de tabulación lógico.
- **Contraste** ≥4.5:1 texto normal / ≥3:1 texto grande y componentes/estados (validado por token, §2).
- **Nombres accesibles** en todo control (`label`/`aria-label`); errores de formulario asociados al campo.
- **Color no es el único indicador** (estado, error, requerido → también texto/icono).
- **Reflow** usable a 320px y con zoom 200% sin pérdida de contenido/función (1.4.10).
- **`prefers-reduced-motion`** respetado.

> axe-core no cubre el 100% de WCAG; los criterios de teclado/foco/reflow se verifican además con test de
> interacción (RTL/Playwright) y checklist manual en el spec de cada slice.

---

## 8. Contenido y errores

- **Idioma:** toda la UI y los mensajes al usuario en **español**; identificadores y código en inglés.
- **Mapeo de errores del contrato → mensaje de usuario** (la UI **no inventa**; mapea el `code`):

| `code` (contrato) | Mensaje UI (español) |
|---|---|
| `UNAUTHENTICATED` / 401 | «Tu sesión ha caducado. Vuelve a iniciar sesión.» |
| `FORBIDDEN_ROLE` / 403 | «No tienes permiso para esta acción.» |
| `NOT_FOUND` / 404 | «Esta orden no existe o no está disponible para ti.» |
| `INVALID_TRANSITION` (422 en start/execution; 409 solo en el guard de evidencia de review) | «La orden ha cambiado de estado. Actualiza y reinténtalo.» |
| `EVIDENCE_REQUIRED` / 422 | «Añade al menos una foto antes de enviar.» |
| `INVALID_ASSIGNEE` / 422 | «El técnico destino no es válido.» |
| `INVALID_EVIDENCE` / 422 | «La evidencia no cumple los requisitos (formato/tamaño).» |
| `INVALID_REASON` / 422 | «Indica un motivo válido.» |
| `VALIDATION_ERROR` / 422 | «Revisa los campos marcados.» (detalle por campo desde `details`) |
| `RATE_LIMITED` / 429 | «Demasiadas solicitudes. Espera unos segundos.» |
| `SERVICE_UNAVAILABLE` / 503 | «Servicio no disponible temporalmente. Reinténtalo.» |
| `AI_UNAVAILABLE` / 501 (018, dev-only) | «El resumen por IA no está disponible en este entorno.» (**sin** reintento; el disparador se deshabilita) |
| `INTERNAL` / 500 · **fallback** (code ausente de esta tabla o respuesta sin `code`) | «Ha ocurrido un error. Reinténtalo.» |
| *(sin respuesta HTTP: offline / timeout de fetch)* | «Sin conexión. Reinténtalo.» |

> El contrato uniforma 404 sin 403 en lectura (getOrderDetail, #010): la UI usa el mismo mensaje de
> «no disponible» para no filtrar existencia entre roles.
>
> **Fallback obligatorio (gate G1 FE-1):** el mensaje genérico «Ha ocurrido un error. Reinténtalo.» cubre
> cualquier `code` no mapeado; la UI **nunca** improvisa texto fuera de esta tabla ni deja la vista colgada.

---

## 9. Qué NO es esto

- No es una librería de componentes de terceros (prohibida por constitución).
- No fija la implementación CSS exacta (eso vive en `frontend/src/ui/`, FE-1).
- No amplía el alcance funcional del brief: solo da el lenguaje visual para las features 001–#010 ya
  contratadas. Cualquier token/componente nuevo entra por consumo de un spec de UI, validado por el panel.
