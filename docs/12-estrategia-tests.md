# 12 · Estrategia de test (profundidad y método)

> Cómo planteamos los tests y qué profundidad tienen. Base normativa: Constitution **VII** (TDD, fase
> Red, BD real, cobertura) + **II** (contract), **IV** (seguridad), **VI** (trazabilidad),
> **VIII/XIV** (evals). Enfoque **riesgo-dirigido**: mucho peso en dominio, seguridad y contrato; no
> *gold-plating*.

## Pirámide (Vitest)

| Capa | Qué cubre | BD / dobles | Peso |
|------|-----------|-------------|------|
| **Unit — dominio puro** | Máquina de estados, política RBAC (matriz rol×alcance), reglas de negocio, `Result/Either` | **Sin BD**, sin infra | ★★★ (base) |
| **Integración** | Servicios + repositorios, transacciones, transiciones extremo a extremo a nivel servicio | **Postgres real (docker-compose)**, nunca mocks del ORM | ★★ |
| **Contract** | Cada `operationId × código` del OpenAPI (Supertest) | App real | ★★ |
| **Seguridad (negativos)** | 401/403/404/409, `assigned_to`, estado de origen, por endpoint y rol | App real | ★★ (no negociable) |
| **Evals (promptfoo)** | IA: faithfulness/alucinación/no-PII/fallback + aserciones de Success Criteria | `claude -p` (sin API) | ★ |
| **E2E (Playwright)** | Flujos navegador→API→BD | *stretch*, **lanzamiento justificado** | ✩ (opt-in) |

## Profundidad (umbrales — gate duro por capa)

- **Dominio ≥ 80%** y **servicios ≥ 80%** de cobertura.
- **100% de contratos** (cada endpoint × código documentado).
- **100% de transiciones** de la máquina de estados (caminos válidos e inválidos).
- **TDD con fase Red**: commit del test en rojo **antes** del commit de implementación (misma rama).

## Base de datos en tests

- **Postgres vía docker-compose**, en una **BD de test independiente** de la de dev.
- Los **datos semilla** sirven además para un **POV básico** de la app (demo reproducible).
- Diseño desacoplado: cambiar a **Testcontainers** más adelante es trivial mientras la BD de test sea
  independiente (no compartir estado con dev/prod).

## E2E (Playwright) — política de coste

- Es **stretch** y **NO corre en el gate/CI por defecto** (coste en tokens/tiempo).
- Se lanza **solo con justificación explícita** (p. ej. validar un flujo crítico completo antes de una
  entrega), y para 1-2 caminos felices como mucho.

## Método y convenciones

- **TDD** Red-Green-Refactor; nombres `should <comportamiento> when <condición>`; patrón AAA.
- **Dobles de test** solo para terceros / reloj / aleatoriedad (Constitution VII); el resto, real.
- **Trazabilidad**: cada FR → ≥1 test nombrable en `docs/traceability.md` (Constitution VI).
- **Fixtures/seed** reproducibles para órdenes en cada estado (assigned / in_progress / pending_review).

## Encaje con los gates (deterministic-first)

En **G3**: primero lo determinista y barato, *fail-fast* — `tsc` → `eslint` → `vitest` → `promptfoo`;
solo si pasa, el agente `revisor-implementacion` comprueba que los tests **ejercitan de verdad los
acceptance criteria** (no "verde vacío"). E2E queda fuera de este ciclo salvo lanzamiento justificado.
