# Gate G3 — 003-order-fsm-audit (002b · Order FSM + auditoría append-only)

**Fecha**: 2026-07-11 · **Fase**: G3 (post-implementación, acumulativo G1+G2+implementación) ·
**Resultado**: ✅ **PASS** (0 BLOQUEANTES) · **Veredicto**: APROBADA_CON_COMENTARIOS

**Panel** (5 agentes): `revisor-cinico`, `auditor-spec-theater`, `revisor-rbac-seguridad`,
`revisor-consistencia`, `revisor-implementacion`.

**promptfoo**: **N/A** — 002b es dominio puro sin componente IA ni endpoint. Los Success Criteria se
verifican con la suite **Vitest contra Postgres real (184/184 verde)**; `tsc`/`eslint` limpios; cobertura
`domain/order` 100%, `infra/repositories` 99%/86.9% ramas; migración `down.sql` sin huérfanos. Coherente
con contract-first N/A (plan.md).

## Recuento

| Severidad | Nº |
|---|---|
| BLOQUEANTE | **0** |
| ALTA | 4 |
| MEDIA | 5 |
| BAJA | 2 |

## Hallazgos y disposición

| ID | Sev | Convergencia | Tema | Disposición |
|----|-----|--------------|------|-------------|
| G3-A1 | ALTA | cínico+rbac+consistencia (3) | `GUARD_UNMET→403` fijo contradice FR-009 | **RESUELTO en G3**: default → **FAIL-SAFE 404** + test unit |
| G3-A2 | ALTA | cínico+rbac | Redacción `reason`: profundidad de paths (logging HTTP futuro) | Diferido 004/005 (BL-055/056): en 002b `applyTransition` no loguea |
| G3-A3 | ALTA | rbac | `guard?`/`actorId` opcionales, sin tipo nominal | Por diseño (slice XV) + diferido 004/005 (BL-056): RBAC vive en el endpoint |
| G3-A4 | ALTA | impl | Sin commit Red separado (trazabilidad TDD) | Aceptado con transparencia (ver nota); disciplina reafirmada para 004/005 |
| G3-M1 | MEDIA | cínico+rbac+impl | Errores BD ≠ P2003 se repropagan sin sanear | Diferido 004/005: catch-all HTTP con test |
| G3-M2 | MEDIA | cínico | Extensibilidad de `TransitionGuard` | Diferido (BL-056): extensión aditiva |
| G3-M3 | MEDIA | cínico | `assignedTo` sin concurrencia optimista (reasignación futura) | Diferido a 004 |
| G3-M4 | MEDIA | consistencia | Glosario no refleja split OrderAudit vs accesos-denegados | Diferido (doc) |
| G3-M5 | MEDIA | impl | Rol único BD (owner=runtime) | Diferido (BL-055): trigger ya independiente del rol |
| G3-B1 | BAJA | consistencia | Redacción T006 vs comportamiento del use case | Aceptado: comportamiento correcto y cubierto |
| G3-B2 | BAJA | impl | Rama `throw e` (no P2003) sin test | Diferido: cubrir con el catch-all de 004/005 |

## Nota de seguridad

Ningún hallazgo es **explotable dentro del alcance de 002b** (dominio puro, sin endpoint). Los principios
no-excepcionables (IV/IX/XI) se cumplen: FSM explícita, auditoría atómica append-only a nivel de BD
(TRIGGER independiente del propietario), `reason` nunca en logs/errores, mensaje crudo de Postgres no
propagado (ACTOR_INVALID). Las **ALTAS restantes son riesgos que 003/004/005 HEREDAN de artefactos
compartidos** (tabla de mapeo HTTP, redacción de logs, contrato de guarda) y **DEBEN cerrarse en sus
gates antes de exponer el primer endpoint** — recomendación unánime del panel.

## Nota de proceso (G3-A4)

En 002b los tests y el código se desarrollaron en un solo lote de trabajo, sin un commit "Red" (test en
rojo) separado previo a la implementación, a diferencia de 001/002a. Mitigación: los tests son de
contrato (aserciones sobre valores concretos: status codes, conteos de filas, centinelas — no ajustadas
al output), cobertura exhaustiva y todos ejercitan Postgres real. El commit de cierre separa `test(002b)`
de `feat(002b)`. La disciplina de commit Red-first se reafirma explícitamente para 003/004/005.
