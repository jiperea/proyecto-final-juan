# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]

**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]

**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]

**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: debe pasar antes de Phase 0 y re-comprobarse tras Phase 1. Una casilla sin marcar bloquea el
avance; una excepción requiere justificación (y NUNCA es válida para seguridad o bloqueantes).*

### Gate · Contract-First (Principio II)

- [ ] Existe (o se creará en Phase 1) el contrato `contracts/*.openapi.yaml` (OpenAPI 3.1) **antes** del código.
- [ ] Tipos/validación (Zod) **derivados** del contrato; `snake_case` externo / `camelCase` interno.
- [ ] Cada `operationId` × código de respuesta documentado tendrá contract test (100%).

### Gate · RBAC y seguridad (Principios IV, IX, XI)

- [ ] Cada acción valida **rol + pertenencia** (`assigned_to == usuario`) **y estado de origen** en backend.
- [ ] 401/403/404/409 distinguidos; test negativo por endpoint y rol no autorizado.
- [ ] PII: cifrado en reposo, URLs firmadas ≤ 300 s, redacción en logs, minimización antes del proveedor IA.
- [ ] Auditoría append-only (incl. accesos denegados); lectura por RBAC.

### Gate · Arquitectura Hexagonal (Principio III)

- [ ] Capas `domain/` (pura) · `handlers/` · `infra/`; el dominio no importa Express/Prisma/SDK-IA.
- [ ] Dependencias por inyección (puertos); dominio testeable sin BD.

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)

- [ ] FRs en EARS; trazabilidad RF→endpoint→tarea→test.
- [ ] TDD con **commit de test en rojo** previo; cobertura dominio ≥80% y servicios ≥80%.
- [ ] SC medibles con eval (**promptfoo**); gates adversariales G1/G2/G3 previstos (0 bloqueantes).

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [DEFAULT en este proyecto] Option 2: Web app hexagonal (backend + frontend)
backend/
├── src/
│   ├── domain/         # lógica pura + puertos (NO importa Express/Prisma/SDK-IA)
│   ├── handlers/       # orquestación HTTP (controllers, rutas)
│   └── infra/          # Prisma, proveedor IA, adaptadores de puertos
└── tests/              # unit (domain, sin BD) · integration (BD real) · contract

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
