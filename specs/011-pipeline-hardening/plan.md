# Plan: Endurecimiento del pipeline (011)

**Branch**: `chore/devops-do1-pipeline` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

## Summary
3 arreglos del pipeline (010) descubiertos en la 1ª ejecución real en Actions: (1) seed del entorno de test,
(2) Spectral vía Docker action fiable, (3) política de Trivy acotada al app (enmienda FR-P05). Cambios solo en
`.github/workflows/*` + `docs/pipeline-spec.md` (FR-P05). Determinista, API-free (NFR-P03 intacto).

## Technical Context
- **Superficie**: `pr-validation-back.yml`, `ci-develop-back.yml`, `ci-main-back.yml` (seed); `pr-validation-back.yml` job `contracts` (Spectral); `pr-validation-back.yml` job `image-scan` + `ci-develop/main-back` build+Trivy (política Trivy).
- **Nueva action**: `stoplightio/spectral-action@6416fd018ae38e60136775066eb3e98172143141` (v0.8.13, SHA-pin, FR-P13).
- **Trivy**: input `skip-dirs: usr/local/lib/node_modules/npm` (excluye npm del base image).
- **Verificación**: ejecución real en Actions (3 jobs verdes) + estática (YAML, SHA-pin, guardián/acceptance 0).

## Constitution Check
- **XVI (pipeline gobernado)**: ✅ spec-antes-que-YAML (este spec precede al cambio); SHA-pin mantenido; permisos mínimos sin cambio.
- **XIII (0 bloqueantes)**: gate adversarial (panel reducido por alcance) antes de dar por hecho.
- **NFR-P03 (API-free)**: ✅ intacto (ningún LLM nuevo en CI).
- Gates de app (contract-first/RBAC/hexagonal/TDD-coverage): **N/A** (pipeline, igual que 010).

## Fases (para tasks)
1. Seed en los 3 jobs de test de back (FR-001).
2. Spectral → Docker action SHA-pin (FR-002).
3. Trivy `skip-dirs` npm del base image, en los 3 puntos donde corre Trivy (FR-003).
4. Enmendar `docs/pipeline-spec.md` FR-P05 (política Trivy) + nota en bitácora.
5. Verificación estática + (usuario) push al fork → 3 jobs verdes.

## Complexity Tracking
| Desviación | Por qué | Alternativa rechazada |
|---|---|---|
| Enmendar FR-P05 (skip npm base image) | vulns del npm del base image no son superficie de runtime; sin skip, gate rojo perpetuo | actualizar/cambiar base image (mayor alcance, deuda anotada) |
| Panel de gate reducido | alcance = 3 fixes acotados + deadline | panel completo 4 agentes (coste/tiempo desproporcionado) |
