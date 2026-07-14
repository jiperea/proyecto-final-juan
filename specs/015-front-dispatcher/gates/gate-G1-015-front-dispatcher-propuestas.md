# Propuestas de remediación — Gate G1 · 015-front-dispatcher

> El `remediador` **propone**; no aplica. La corrección se hace **por skill** (2ª ronda `/speckit-clarify`),
> se revisa y la re-valida el siguiente pase de G1 (separación de funciones). Avance detenido hasta 0 bloqueantes.

## BLOQUEANTE — decisión de usuario

- **G1-B01 (origen del UUID del técnico)**. Sin ampliar el contrato 004:
  - **Opción A (recomendada)** — *fuente externa explícita*: documentar en Assumptions que el dispatcher obtiene el UUID por un canal fuera de la app (roster operativo, el propio técnico/su responsable); el hint del campo lo refleja; reformular SC-001 ("…y un UUID de destino conocido de antemano fuera de banda"). Cierra la deuda de backend ya registrada (selector real futuro).
  - **Opción B** — *autocompletado de recientes (solo front)*: `datalist` que recuerda en memoria de sesión (nunca persistido) los `assigned_to` ya vistos en `GET /orders`, como ayuda de copia/pega. No es un listado de técnicos con nombre.

## ALTAS — endurecimiento con default defendible (encodar por clarify)

- **G1-A01 (500)**: añadir 500/código no contemplado al alcance de errores (nuevo FR + fila de trazabilidad); mensaje genérico sin boundary.
- **G1-A02 (red/transporte)**: nuevo FR + edge case para timeout/sin conexión/no-JSON → mensaje de conectividad distinto del mapeo por código, con reintento conservando lo introducido.
- **G1-A03 (last-write-wins)**: FR-003 refleja SIEMPRE la última respuesta del backend (no retiene la escritura propia si el backend la sobrescribió); sin indicación de conflicto (coherente con lo asumido).
- **G1-A04 ('sin recarga completa')**: criterio objetivo — sin evento de navegación de documento + el nodo raíz del shell y el scroll del listado se conservan (identidad de referencia DOM).
- **G1-A05 (foco tras éxito)**: mover el foco al elemento que muestra el nuevo asignatario en el detalle (coincide con el anuncio de la región viva).
- **G1-A06 (no persistir en storage)**: FR-011 prohíbe además persistir reason/assignee_id en localStorage/sessionStorage/IndexedDB/cookies (solo memoria del formulario); SC-005 añade espía de storage.
- **G1-A07 (a11y en error)**: nuevo FR — error asociado con `aria-describedby`+`aria-invalid` y foco/anuncio perceptible; extender FR-013 a caminos de error.
- **G1-A08 (contraste)**: SC-003 fija ≥4.5:1 texto / ≥3:1 componentes y foco en los estados nuevos, con comprobación dirigida a disabled/focus (axe no la cubre fiable).
- **G1-A09 (responsive)**: default — por debajo del breakpoint de escritorio de FE-1 se oculta el control de reasignación (detalle en lectura); FE-3 es explícitamente de escritorio. DECISIÓN con default (usuario puede pedir soporte tablet).

## MEDIAS — encodar breve o diferir a plan.md (anotadas, no en silencio)

- Encodar en spec: **G1-M02** (limpiar panel de detalle tras 404), **G1-M05** (ambos errores de cliente a la vez), **G1-M07** (`aria-live=polite` + anuncio nombra al destino), **G1-M08** (UUID RFC 4122 v1–v5, regex de referencia), **G1-M11** (límite de intentos = responsabilidad backend), **G1-M12** (FR-011 alcanza SDKs de terceros del shell), **G1-M13** (aria-describedby ayuda+error, validación on blur/submit), **G1-M14** (tap targets ≥44px). **G1-M03** se cierra con B01.
- Diferir a **plan.md/tasks.md** (explícito): **G1-M01** (mock validado contra contrato), **G1-M04** (riesgo CD por fases 404 infra vs negocio), **G1-M06** (tabla de claves i18n), **G1-M09** (regla lint de estilos sueltos), **G1-M10** (mecanismo de verificación de telemetría según SDK del shell).
