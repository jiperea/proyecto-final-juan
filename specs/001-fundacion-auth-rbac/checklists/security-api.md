# Checklist de calidad de requisitos: Auth / Sesión / RBAC (seguridad + API)

**Purpose**: "Unit tests for English" — validar que los REQUISITOS de la 001 están completos, claros,
consistentes, medibles y cubren los escenarios, antes de `/speckit-plan`. NO prueba implementación.
**Created**: 2026-07-10
**Feature**: [spec.md](../spec.md) · Complementa `requirements.md` (calidad general de la spec).

## Requirement Completeness

- [ ] CHK001 - ¿Están especificados los requisitos para todos los modos de fallo del login (credenciales inválidas, cuenta bloqueada, identifier inexistente)? [Completeness, Spec §FR-002/FR-011]
- [ ] CHK002 - ¿Se define el comportamiento de rotación del refresh y la detección de reuso (familia)? [Completeness, Spec §FR-004/FR-004b]
- [ ] CHK003 - ¿Se especifica la verificación de estado de cuenta (activo/bloqueado) en refresh y en validación de access, no solo en login? [Completeness, Spec §FR-004c]
- [ ] CHK004 - ¿Está documentada la lista **cerrada** de cabeceras de seguridad exigidas? [Completeness, Spec §FR-012]
- [ ] CHK005 - ¿Se define el contrato de error `{code, message, details?, agent_action?}` con el conjunto completo de códigos HTTP? [Completeness, Spec §FR-013]
- [ ] CHK006 - ¿Se especifica el comportamiento de arranque con configuración inválida (fail-fast + nombrar variable)? [Completeness, Spec §FR-016]
- [ ] CHK007 - ¿Están documentadas todas las suposiciones que afectan a seguridad (TTLs, lockout, política de contraseña, usuarios semilla)? [Completeness, Spec §Assumptions]

## Requirement Clarity (desambiguación / cuantificación)

- [ ] CHK008 - ¿Está cuantificado el NFR "rápido" con umbral y percentil? [Clarity, Spec §SC-005]
- [ ] CHK009 - ¿Está cuantificado el lockout (nº de intentos, ventana, duración, ventana fija vs deslizante)? [Clarity, Spec §FR-011]
- [ ] CHK010 - ¿Se define de forma medible la no-enumeración (misma forma/tiempo, umbral <50 ms P95)? [Clarity, Spec §FR-011]
- [ ] CHK011 - ¿Se distingue sin ambigüedad 401 vs 403 vs 404 con una regla aplicable? [Clarity, Spec §FR-007/008/009/017]
- [ ] CHK012 - ¿Se define qué significa "sesión" vs "dispositivo" y el alcance del logout (solo la actual)? [Clarity, Spec §FR-003/FR-003b]
- [ ] CHK013 - ¿Se distingue "logout voluntario" (access expira por TTL) de "compromiso confirmado" (invalidación inmediata)? [Clarity, Spec §FR-003/FR-004b]

## Requirement Consistency

- [ ] CHK014 - ¿La regla 403-vs-404 es consistente entre las user stories, los FRs y la trazabilidad? [Consistency, Spec §US3/FR-009/FR-017]
- [ ] CHK015 - ¿El "espacio de unicidad global" de email/username es coherente entre FR-001b, Key Entities y el esquema del contrato? [Consistency, Spec §FR-001b/Contrato]
- [ ] CHK016 - ¿Los códigos de respuesta del contrato OpenAPI coinciden con los exigidos por los FRs (p. ej. 429 en login, 503 en ready)? [Consistency, Spec §Contrato/FR-011/FR-013/FR-015]
- [ ] CHK017 - ¿La ventana de gracia (FR-004d) no contradice la invalidación por reuso (FR-004b)? [Consistency, Spec §FR-004b/FR-004d]

## Acceptance Criteria Quality (medibilidad)

- [ ] CHK018 - ¿Cada Success Criterion es objetivamente verificable (métrica/umbral, no adjetivo)? [Measurability, Spec §SC-001..006]
- [ ] CHK019 - ¿Existe una fila de trazabilidad RF→endpoint→test para cada FR (incluidos 001b/003b/004b/c/d/017)? [Traceability, Spec §Trazabilidad]
- [ ] CHK020 - ¿El SC de rechazos (SC-002) cubre el 100% de los intentos sin permiso con el código correcto? [Measurability, Spec §SC-002]

## Scenario & Edge Case Coverage

- [ ] CHK021 - ¿Se cubren los flujos de recuperación/excepción (refresh revocado, token manipulado, carrera de rotación)? [Coverage, Spec §Edge Cases/FR-004d]
- [ ] CHK022 - ¿Se aborda la concurrencia (sesiones concurrentes, reintento idempotente de refresh)? [Coverage, Spec §FR-003b/FR-004d]
- [ ] CHK023 - ¿Se define el estado-cero / datos semilla (no hay auto-registro; usuarios semilla)? [Coverage, Spec §Assumptions]

## Dependencies, Assumptions & Deferrals

- [ ] CHK024 - ¿Los diferidos a `/plan` (técnica CSRF, access en body vs cookie) están marcados explícitamente y no como huecos? [Assumption, Spec §FR-012/backlog BL-014]
- [ ] CHK025 - ¿Lo explícitamente fuera de alcance (Order, multi-tenant, alta de usuarios) está declarado para no marcarse como AUSENTE? [Scope, Spec §Input/Assumptions]
- [ ] CHK026 - ¿La afirmación "base-ready" (auditoría de accesos denegados sin reescritura) es una decisión de diseño verificable y no una promesa vaga? [Ambiguity, Spec §Key Entities]
