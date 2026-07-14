# 15 · Bitácora del proceso CI/CD (fase DevOps · reto M12)

> Registro cronológico de **decisiones, avances y lecciones** de la fase DevOps. La gobernanza está en
> [`pipeline-constitution.md`](pipeline-constitution.md); la spec ejecutable en
> [`pipeline-spec.md`](pipeline-spec.md); el plan por pasos en [`06-roadmap.md`](06-roadmap.md) §DevOps.
> Alcance acordado: **Mínima DO-1→DO-6** (sin CD). Regla rectora: **spec antes que YAML**.

## Decisiones de fase (acordadas al entrar)

| # | Decisión | Elegido | Motivo |
|---|----------|---------|--------|
| D1 | Ubicación de la gobernanza | **Principio XVI en constitución + `docs/pipeline-constitution.md`** | separa lo normativo (constitución) del detalle operativo |
| D2 | Alcance ahora | **Mínima DO-1→DO-6** (sin CD/DO-7) | es lo exigido por el reto; CD topa con el muro de repo privado Free |
| D3 | Estrategia de ramas | **`feature/* → develop → main`** | GitFlow del reto; ya en uso en el repo |
| D4 | Qué se implementa | **el reto (roadmap DO-1..6)**; M9 = referencia/ejemplo | M9/M10 es teoría; el entregable es el reto M12 |
| D5 | Coste | **CI API-free / token-free** | regla del proyecto (CLAUDE.md); evals de IA en local, no en CI |
| D6 | Estructura de ficheros | Dockerfiles por componente · compose en raíz · workflows en `.github/workflows/` · sin carpeta `infra/` | convención de monorepo; `infra/` solo si hubiera CD/IaC |

## DO-1 · Gobernanza + spec del pipeline — 2026-07-14

**Hecho:**
- Enmienda de constitución **v1.9.1 → v1.10.0** (MINOR): principio nuevo **XVI. Pipeline como gate
  gobernado** (spec-antes-que-YAML, spec-as-gate, SHA-pin, permisos mínimos, no-rebuild, flujos por
  componente, ramas develop/main, CI<10min). Detalle delegado a los docs de pipeline.
- `docs/pipeline-constitution.md` (gobernanza) + `docs/pipeline-spec.md` (FRs EARS, NFR CI<10min, ACs).
- Esta bitácora.
- **Rama dedicada** `chore/devops-do1-pipeline` (ADR-0004: fundación transversal, no rama de feature).

**Clave (regla de oro):** este commit de DO-1 **precede en git a cualquier `.yml`** de workflow real →
satisface AC-1 (`git log --diff-filter=A`). El `.github/workflows/ci.yml` actual es un **placeholder de
fundación** (gitleaks + build-test sobre un `package.json` de raíz inexistente); se reemplaza por los
workflows spec-derivados en DO-3+.

**Herencia registrada:** el *verificador determinista de constitución* de M9/M10 (`validate-constitution.sh`)
que quedó en backlog (docs/13) se materializa como el **guardián de Constitución** del PR-gate (FR-P07).

**Pendiente:** DO-2 (contenerización) → DO-3 (PR-gate back) → DO-4/5 (CI develop/main + GHCR) → DO-6
(workflows front).

<!-- Próximas entradas: DO-2, DO-3, … se añaden aquí conforme se completan, con problemas/lecciones. -->
