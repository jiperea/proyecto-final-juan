# PR: [feature / cambio]

## Spec y trazabilidad (obligatorio — Constitution I, VI)

- **Feature / rama**: `NNN-feature`
- **Spec**: `specs/NNN-feature/spec.md`
- **FRs cubiertos**: FR-0xx, ...
- [ ] La spec fue **antes** que el código (commits separados)
- [ ] Trazabilidad RF → endpoint → test actualizada (`docs/traceability.md`)

## Contrato (Constitution II)

- [ ] Contrato OpenAPI en `contracts/` **antes** del código; tipos derivados
- [ ] Contract tests por endpoint × código de respuesta

## Gates adversariales (Constitution XIII)

- [ ] **G1** (tras clarify) — 0 bloqueantes · informe en `specs/<feature>/gates/`
- [ ] **G2** (tras analyze) — 0 bloqueantes
- [ ] **G3** (tras implement + tests) — 0 bloqueantes
- [ ] Evals (promptfoo) en umbral (si aplica IA / SC)

## Calidad (Constitution VII, IX, XII)

- [ ] TDD: commit de test en rojo previo; cobertura dominio ≥80% y servicios ≥80%
- [ ] RBAC en backend (rol + pertenencia + estado de origen); 401/403/404/409
- [ ] PII: cifrado, URLs firmadas ≤300 s, no en logs, minimización a la IA
- [ ] `npm test`, `npm run lint` en verde en máquina limpia

## Excepciones

> Los bloqueantes y los principios de seguridad (IV/IX/XI) NO son excepcionables. Cualquier otra
> excepción requiere aprobación de alguien distinto del autor y con competencia (enlazar aquí).

## Notas
