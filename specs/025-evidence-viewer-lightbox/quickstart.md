# Quickstart — Validación del visor de evidencia (025)

Feature **solo frontend**. Reutiliza `getOrderEvidence` e `items[]` de 024. No requiere cambios de backend/BD.

## Prerrequisitos

- Frontend en marcha (`make dev` → `:5173`, backend `:3001`) o entorno de tests de front.
- Una orden con **evidencia con blob** visible para el rol. Como la evidencia del seed no tiene blob (ver [[make-seed-wrong-db-and-us3-descope]] / descope de US3), para validación manual: iniciar sesión como **técnico**, abrir una orden `in_progress`, **registrar ejecución subiendo una foto** (flujo de 024). Esa orden (ahora `pending_review`) tendrá evidencia servible al técnico y al supervisor.

## Validación automatizada (autoritativa)

```bash
# Tests de componente + a11y (getOrderEvidence mockeado, sin backend)
make test            # o: bash scripts/dcnode.sh npx vitest run
bash scripts/dcnode.sh npx vitest run src/features/orders/EvidenceViewer   # foco en el visor
bash scripts/dcnode.sh npm run lint       # eslint (tokens, jsx-a11y)
bash scripts/dcnode.sh npm run typecheck  # tsc strict
# stylelint del proyecto: 0 hex/px/tipografía sueltos en el visor (SC-005)
```

**Esperado**: verde. Los tests cubren SC-001..SC-005 (apertura 1 gesto, alcanzar N imágenes sin reabrir, axe 0 violaciones, cierre triple + retorno de foco, 0 estilos sueltos).

## Validación manual (opcional, fidelidad visual)

1. Abrir el detalle de una orden con ≥1 evidencia con blob → los tiles de evidencia son activables.
2. **US1**: click (o Enter/Espacio) en un tile → se abre el visor a tamaño completo. Comprobar: `role=dialog`/`aria-modal`, foco dentro, Tab no escapa al fondo. Cerrar con **Esc**, con **click en el backdrop** y con el **botón cerrar** → el foco vuelve al tile.
3. **US2** (orden con ≥2 evidencias): indicador «k de N»; flechas ←/→ y controles anterior/siguiente cambian de imagen; en la 1ª/última el control correspondiente queda deshabilitado (no envuelve). Con 1 sola evidencia: sin controles ni indicador.
4. **Errores**: si un blob no está (410) → «La evidencia ya no está disponible» dentro del visor, sin imagen rota; sin fuga de código/detalle.
5. **A11y/motion**: con `prefers-reduced-motion` activo, apertura/cambio sin animación (instantáneo). Probar a 360 px y 1280 px: sin scroll horizontal.

## Referencias

- Requisitos y criterios: [spec.md](./spec.md) (FR-001..FR-014, SC-001..SC-005).
- Decisiones de diseño: [research.md](./research.md).
- Patrón de modal reutilizado: `frontend/src/ui/ConfirmDialog.tsx`.
