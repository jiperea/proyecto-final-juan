# Quickstart — Validación de FE-5 (reskin + tema oscuro)

Guía de validación end-to-end. No incluye código de implementación; prueba que la feature cumple los SC.

## Prerrequisitos

```bash
cd frontend
npm ci
```

## 1. Verificación determinista (la que bloquea G3)

```bash
cd frontend
npm run lint        # eslint (FR-017c/inline) + stylelint (0 estilos sueltos)   → SC-001
npm run typecheck   # tsc -b --noEmit + codegen:check (contratos intactos)      → SC-002
npm run build       # tsc -b && vite build                                       → SC-002
npm run test        # vitest: suite existente + nuevos (contraste 18 pares ×2 temas, tema, stepper, RBAC)
                    #   → SC-003a/004/005/006/007/008/010
npm run test:e2e    # playwright: reskin-responsive (320px/zoom200, sin overflow-x) → SC-011
bash scripts/check-rbac-test-diff.sh   # guardián determinista de SC-004 (exit ≠0 si cambia una aserción)
```

Criterios de aceptación:
- **SC-001**: `stylelint` 0 violaciones (0 literales fuera de `src/ui/tokens.css`).
- **SC-003a**: el test de ratios recorre la **lista cerrada de 18 pares** (spec §Pares de contraste) en
  **claro y oscuro** → 0 pares por debajo de su umbral (4.5:1 / 3:1).
- **SC-003b**: `vitest-axe` 0 violaciones serias/críticas por pantalla.
- **SC-004**: `scripts/check-rbac-test-diff.sh` sale con código 0 (ninguna **línea de aserción** RBAC
  cambió); suite en verde.
- **SC-005**: el detalle en cada uno de los 5 estados del FSM pinta el Stepper con el paso actual correcto.
- **SC-006**: `data-theme` fuerza tema, persiste tras recarga; «sistema» borra la clave; cambio de tema no
  remonta (foco preservado). **SC-007**: `localStorage` solo la clave de tema. **SC-008**: Stepper/
  ThemeToggle sin fetch. **SC-010**: regresión RBAC por rol×estado.
- **SC-011**: e2e Playwright — sin scroll horizontal del `body` a 320px/zoom 200%; master-detail ≥1024px.

## 2. Validación visual manual (fidelidad al artifact)

```bash
cd frontend && npm run dev   # http://localhost:5173
```

- **Tema claro**: acento **naranja** en acciones primarias y foco; badges de estado con la paleta nueva
  (color **+** etiqueta de texto); tarjetas con radios/sombras suaves.
- **Conmutador de tema** (cabecera): claro / oscuro / sistema. Elegir «oscuro» → toda la app en oscuro;
  recargar → se mantiene; «sistema» → sigue la preferencia del SO.
- **Anti-FOUC**: con «oscuro» elegido y el SO en claro, recargar **no** produce parpadeo claro→oscuro.
- **Detalle de una orden**: **Stepper** del ciclo de vida con el paso actual resaltado.
- **Revisión (supervisor, ≥1024px)**: **tarjeta de resumen IA** con acento de revisión y nota de guardián
  completa (sin truncar).
- **Responsive**: a 320px y con zoom 200% no hay scroll horizontal del `body`; móvil (técnico) en una
  columna, oficina en master-detail (≥1024px).
- **Reduced motion**: con `prefers-reduced-motion: reduce` no hay transiciones.

## 3. Comprobación de tema del SO (opcional)

Con el sistema operativo en modo oscuro y el conmutador en «sistema», la app arranca en oscuro y refleja
en vivo el cambio de tema del SO (garantía CSS-first, sin recargar).

## Qué NO debe cambiar (no-regresión)

- Ninguna función, permiso ni flujo (login, listar, iniciar/registrar ejecución, reasignar, aprobar/
  rechazar) cambia de comportamiento. Los mismos roles ven/hacen lo mismo.
- Los contratos consumidos (`src/api/generated/*`) no cambian (`codegen:check` en verde).
