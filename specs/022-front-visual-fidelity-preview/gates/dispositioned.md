# Residuales dispuestos — G1 022 (ronda 1 → 2)

Cada hallazgo de la ronda 1 tiene destino trazable. NO re-levantar salvo problema NUEVO o regresión real.

## Bloqueante
- **H-001** (SC-004 axe ↔ FR-010 sub-AA): RESUELTO. SC-002/SC-004 excluyen explícitamente la excepción única de FR-010; axe se mantiene activo salvo esa supresión acotada y anotada. FR-010 materializa la supresión en config de a11y.

## Altas
- **H-002** (bucle rechazo sin parada): RESUELTO. SC-001: aprobación terminal del dueño del brief; «rechazado» → itera y re-somete, converge en el dueño.
- **H-003** (filtro cliente vs paginación): RESUELTO. Assumption: `listOrders` devuelve el conjunto por rol sin paginación de servidor en esta fase; si pagina en el futuro, el filtro pasa a servidor.
- **H-004/H-005/H-006** (responsive por viewport vs rol; sin referencia en viewport contrario): RESUELTO. FR-011 (layout por viewport, no rol) + FR-011a (literal donde el artifact dibuja; coherencia de lenguaje donde no; breakpoints 017 mandan). Edge Cases actualizado.
- **T-001** (fidelidad sin umbral objetivo): RESUELTO. SC-001 + rúbrica: checklist estructural objetiva + SC-002/003 + sin scroll horizontal; el juicio humano solo firma el "se ve como el artifact" tras (a)(b)(c).
- **T-002** (borde oscuro/radio/sombra sin valor): RESUELTO. FR-004 con hex oscuro (`#2A3744`), radios (9/14px) y sombra concretos.
- **T-003** (morado tarjeta IA sin hex): RESUELTO. FR-016 usa el token `pending_review` (`#7C3AED`/`#B896FF`).
- **S-001** (PII en capturas): RESUELTO. FR-014: datos seed/sintéticos, sin PII real; artefactos de PR, sin retención.
- **S-002** (acciones fuera de rol/estado): RESUELTO. FR-013a: visibilidad = lógica existente (rol+estado); RBAC real en backend (401/403); UI = defensa en profundidad.

## Medias
- **H-007** (tarjeta IA vacía en dev vs preview con texto): RESUELTO. FR-016: fidelidad = chrome de la tarjeta; se acepta estado vacío/insuficiente en dev.
- **H-008** (default segmentado + 0 resultados): RESUELTO. FR-005b: default «Activas»; estados vacíos distinguidos.
- **H-009** (breakpoints 017 vs artifact): RESUELTO. FR-011a: mandan los breakpoints de 017.
- **T-004** (halo/miniatura sin medida): RESUELTO. FR-006: halo = anillo `0 0 0 4px` del token pending_review-bg; miniatura 4/3 + `--radius-sm`.
- **T-005** (parecido subjetivo en «maquetación del preview»): DISPUESTO (aceptado). La parte medible = checklist estructural de SC-001 (presencia+jerarquía); el "se ve como" es el visto bueno humano gobernado por la rúbrica. No se puede ni se pretende cuantificar píxel a píxel.
- **S-003** (tarjeta IA expuesta a otros roles): RESUELTO. FR-016: solo donde ya se muestra hoy (supervisor).
- **S-004** (filtro cliente sobre payload no role-scoped): RESUELTO. Invariante de datos/RBAC: el conjunto cargado ya viene acotado por backend; el filtro no amplía visibilidad.
- **S-005** (miniaturas de evidencia / URL firmada): RESUELTO. Invariante: se preservan URLs firmadas ≤300 s; sin cache/persistencia/fuga en logs.

## Ronda 2 (altas)
- **H-001-r2** (stepper: FR-002 naranja vs FR-006 morado): RESUELTO. FR-002 excluye el stepper; el paso actual es **morado** `pending_review` (fiel al artifact), sustituyendo el naranja de FE-7. FR-006 lo fija.
- **H-002-r2** (control de filtro en cruce rol×viewport): RESUELTO. FR-011b: el afijo de filtro sigue al **modo de layout** (apilado→segmentado; master-detail→segmentado+buscador), disponible para cualquier rol en ese viewport.
- **T-006** (semántica de «coincidencia» del buscador): RESUELTO. FR-007a: substring, insensible a mayúsculas y acentos, sobre los 4 campos.

## Ronda 3 (simplificación del modelo de filtro — XV, corta la espiral)
- **H-001-r3** (estado de filtro al cruzar breakpoint) / **H-002-r3** (composición segmentado×buscador): RESUELTO. FR-011b simplificado: **un único estado de filtro** = segmento «Activas/Todas» (default «Activas») **AND** término opcional; segmentado siempre visible (persiste al resize y permite limpiar); buscador = añadido del topbar en master-detail.
- **H-008-r2** («segmentado contextual» indefinido): RESUELTO. Eliminado el término; opciones siempre «Activas/Todas».
- **H-004-r2** (estado vacío del buscador): RESUELTO. FR-005b: tercer estado vacío «sin coincidencias».
- **H-005-r2** (FR-002 omite botones): RESUELTO. FR-002 incluye botones primarios (color por FR-010) y declara enumeración cerrada.
- **H-007-r2** (halo fijo vs color de estado): RESUELTO. FR-006: halo morado **fijo**, independiente del estado; los colores por estado (FR-003) son de chips, no del punto del stepper.
- **T-008** (surface sin hex): RESUELTO. FR-001 fija surface (#FFFFFF/#18212B) y surface-2 (#EDF0F3/#212C38).
- **H-003-r2** (campos de búsqueda por rol): RESUELTO. FR-007a: busca sobre los campos presentes en el payload del rol.
- **H-006-r2 / T-007** (solapamientos no operable + captura viewport contrario): RESUELTO. FR-011a: solo «sin scroll horizontal» (operable), se elimina «solapamientos»; FR-014: smoke-check en el viewport contrario.
- **S-006** (gate de rol de la tarjeta IA en layout compartido): RESUELTO. FR-016: el gate por rol vive en el render del panel, no en el layout.

## Ronda 4
- **H-001-r4 / H-002-r4** (término de búsqueda persistente sin UI en móvil): RESUELTO (corta espiral). FR-011b: el término de búsqueda **se limpia** al ocultarse el buscador (`<1024px`); nunca queda filtro invisible. FR-005b: el estado «sin coincidencias» solo se da donde el buscador está visible.
- **T-009** (hex de FONDO de chips + token pending_review-bg): RESUELTO. FR-003 fija primer plano y fondo de los 5 chips en claro y oscuro, y el token `--status-pending_review-bg` (#EDE6FC/#2A2140).

## Ronda 5
- **H-001-r5** (color del segmento activo): RESUELTO. FR-005: segmento activo = píldora de superficie (no acento), fiel al artifact.
- **H-002-r5** (acento no-textual bajo WCAG 1.4.11): RESUELTO. SC-002a afirma ≥3:1 no-textual para foco y barra de selección (verificado ≈3.4:1), independiente de la excepción de texto de FR-010.

## Ronda 6 (última pasada; tras esto se cierra G1)
- **H-001-r6** (búsqueda oculta `closed` por el segmento): RESUELTO. FR-011b: la búsqueda **prevalece** sobre el segmento y opera sobre todo lo cargado (incl. `closed`).
- **H-002-r6** (franja tablet sin criterio): RESUELTO. FR-011a: no-scroll-horizontal en todo el rango 360–1440px (incl. tablet 391–1023 en modo apilado).
- **H-003-r6** (precedencia de estados vacíos): RESUELTO. FR-005b: con término → «sin coincidencias»; sin término → estados del segmento.
- **H-004-r6** (paridad dev↔build prod): RESUELTO. SC-004: la captura usa el mismo pipeline de estilos que prod; divergencia = regresión.
- **H-005-r6** (ratio oscuro sin valor/superficie): RESUELTO. SC-002a: contra `--color-surface` #18212B, ≥3:1 medido por el test.
- **H-006-r6** (FR-009 cubre menos que la checklist): RESUELTO. FR-009 incluye los 2 campos + botón «Entrar».
- **T-010** (sombra del segmento sin token): RESUELTO. FR-005: `--shadow-1`.

## Ronda 7 (cierre de G1)
- **H-001-r7** (segmento inerte durante búsqueda — ping-pong): RESUELTO (modelo estable). FR-011b: al buscar, el segmento **cambia automáticamente a «Todas»** (visible); nunca inerte ni oculta coincidencias.
- **H-003-r7** (¿oficina existe o se construye?): RESUELTO. Nota de alcance: **no es solo reskin**; el chrome de oficina que falte se **construye** en frontend, sin backend nuevo.
- **H-002-r7** (verde «done» / pendiente del stepper sin valor): RESUELTO. FR-006: done=`closed` verde, pending=`surface-2`+borde.
- **T-001** (color del punto del chip): RESUELTO. FR-003: punto = `currentColor`.
- **H-007-r7** (tarjeta IA sin estado): RESUELTO. FR-016: supervisor, típicamente `pending_review` (donde ya se muestra hoy).
- **DISPUESTOS a /speckit-plan (detalle de implementación, no de spec)**: **H-004** (si el «+» de evidencia lleva acento → se decide al implementar contra el artifact, dentro de tokens), **H-005** (interacción del filtro cliente con refetch/invalidación de TanStack Query → comportamiento de UI a diseñar en plan), **H-006** (umbral numérico de volumen que dispara paginación → métrica operativa, va con la deuda diferida), **T-002** (ancla de clase de `kicker` → detalle de implementación del componente). Ninguno cambia el alcance ni bloquea; se concretan en plan/tasks.
