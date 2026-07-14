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
= DO-7, **en alcance** desde 2026-07-14: Render tira de la imagen de GHCR vía deploy-hook, sin reconstruir;
detalle y FRs en `pipeline-spec.md` §CD.)*

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
- **(c) CD**: **en alcance (DO-7, desde 2026-07-14)**. Target: **Render** (consume la imagen de GHCR vía
  deploy-hook, no-rebuild §4) + **Neon** (Postgres gestionada, **una BD/branch por entorno**), **gratis** y
  con URL pública. **Tres entornos** (reto M12): **dev (`develop`, auto)**, **pre (`main`, auto)** y
  **prod (manual)**. La **aprobación manual a prod** vía *GitHub Environment* (required reviewers) topa con
  el muro de repo privado Free (M9 J2) → **sustituida por `workflow_dispatch` manual + confirmación**
  (`cd-prod.yml`). **Limitación residual asumida:** ese disparo manual lo hace el mismo actor con push
  access (no es una segunda aprobación independiente); freno anti-fat-finger, no control de 2 personas.
- **(d) Guardián de Constitución — dos modos**: por defecto **determinista** (`validate-constitution.sh`,
  0 coste, cumple "sin API de pago"). El reto pide además la **Claude Code Action** (API del agente): se deja
  **preparada y opt-in** (job `guardian-agent`, skipped salvo `secrets.ANTHROPIC_API_KEY`) — **única
  excepción documentada a NFR-P03**. La activa el operador a conciencia. Formalización SDD de esta fase:
  `specs/010-devops-pipeline/` (retroactiva; el "spec-antes-que-YAML" del reto se ancla a `pipeline-spec.md`,
  commit anterior a todo `.yml`).
