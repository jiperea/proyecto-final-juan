# Pipeline Constitution — gobernanza del CI/CD de FieldOps

> Detalle operativo del **Principio XVI** de la constitución (`.specify/memory/constitution.md`). La
> constitución fija las reglas no negociables; **este documento las desarrolla**. Ante conflicto, manda la
> constitución. La **spec** ejecutable del pipeline (FRs/ACs) es [`pipeline-spec.md`](pipeline-spec.md);
> la **bitácora** del proceso es [`15-devops-bitacora.md`](15-devops-bitacora.md).

## 0. Regla de oro: spec antes que YAML

El historial de **git** debe demostrar que `docs/pipeline-spec.md` (y este documento) son **anteriores**
al primer `.yml` de workflow real. Es una exigencia del reto M12 y del Principio I (spec-first) aplicado al
pipeline. *Verificable:* `git log --diff-filter=A -- '.github/workflows/*.yml' docs/pipeline-spec.md`.

> El `ci.yml` actual es un **placeholder de fase fundación** (no ejecuta gates reales); se reemplaza por los
> workflows spec-derivados en DO-3+.

## 1. Estrategia de ramas y entornos

| Rama | Rol | CI | Artefacto |
|------|-----|----|-----------|
| `feature/*` (o `NNN-feature`) | trabajo por spec | PR-validation (gates, sin publicar imagen) | — |
| `develop` | integración | CI completo | imagen `x.y.z-snapshot.{sha}` → GHCR |
| `main` | release | CI completo | imagen `x.y.z` (semver) → GHCR + GitHub Release |

Flujo: `feature/* → develop → main`. Los merges a `develop`/`main` requieren el PR-gate en verde
(branch protection). Coherente con ADR-0004 y con el uso ya establecido en el repo.

## 2. Flujos separados por componente (`paths:`)

Workflows **independientes** para `backend/` y `frontend/`, disparados por filtros `paths:`:
- un cambio solo en `backend/**` **no** dispara los workflows de front (y viceversa);
- cambios en `contracts/**` disparan el back (contrato) y, si aplica, el codegen del front.

Rationale: feedback rápido y coste mínimo; cumple el NFR **CI < 10 min** por componente.

## 3. Cadena de suministro (supply chain)

- **Acciones fijadas por SHA**, no por tag móvil (`uses: actions/checkout@<sha40>  # v4.x`). Evita que un
  tag re-apuntado inyecte código.
- **Permisos mínimos**: `permissions: contents: read` a nivel workflow por defecto; elevación **explícita
  por job** solo donde haga falta (`packages: write` para publicar en GHCR; `contents: write` para Release).
- **Escaneo como gate**: **gitleaks** (secretos) en cada PR; **Trivy** (vulnerabilidades de imagen) antes de
  publicar; fallan el pipeline si superan umbral.
- **Sin secretos en el repo** (`.env`, nunca commiteados; los de CI viven en GitHub Secrets/Environments).

## 4. No rebuild en CD (no negociable)

La imagen que **pasó CI** y está en **GHCR** es la que se despliega. El despliegue **nunca** reconstruye
desde el fuente. Garantiza que lo probado == lo desplegado (integridad y trazabilidad del artefacto). *(CD
= DO-7, fuera del alcance "Mínima" actual; la regla queda fijada para cuando se implemente.)*

## 5. Gates del pipeline (spec-as-gate)

El PR-gate (DO-3/DO-6) bloquea el merge y ejecuta, como mínimo (detalle y ACs en `pipeline-spec.md`):
- **Calidad**: `lint` + `typecheck` + `test` (back y/o front según `paths:`).
- **Contrato** (back): **Spectral** (lint OpenAPI) + **oasdiff** (cambios incompatibles vs base).
- **Front**: `stylelint`+`eslint` (sin estilos sueltos), `codegen:check` (tipos derivados del contrato),
  `axe` (a11y), build.
- **Seguridad**: **gitleaks** (secretos) + **Trivy** (imagen).
- **Guardián de Constitución**: verifica el **orden git spec→YAML**, que las specs de features tengan sus
  gates G1/G2/G3 registrados, y que no se introduzcan violaciones estructurales (p. ej. `.yml` sin spec
  previa). Bloquea el merge si falla.

## 6. Relación con los gates adversariales (XIII)

Los gates **G1/G2/G3** (revisión adversarial por el panel de agentes) operan **antes del commit**, en local
(extensión `speckit-gate`). El **PR-gate de CI** es una **segunda capa determinista** (herramientas) que se
ejecuta en el servidor y protege la rama. No se solapan: G1-3 razonan sobre spec/código; el CI verifica
mecánicamente. Ambos deben estar en verde para mergear.

## 7. Decisiones (resueltas en DO-1)

- **(a) Ramas**: `feature/* → develop → main` (formalizado, §1).
- **(b) Ubicación de la gobernanza**: principio XVI en la constitución **+** este documento (detalle).
- **(c) CD**: **fuera del alcance actual** (Mínima DO-1→DO-6). Si se aborda (DO-7): PaaS que consume la
  imagen de GHCR + Postgres gestionada (Render/Railway/Fly.io), con la regla de **no-rebuild** (§4) y
  aprobación manual a prod vía GitHub Environment (topa con el muro de repo privado Free, M9 J2).
