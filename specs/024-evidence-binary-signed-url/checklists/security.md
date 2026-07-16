# Checklist de calidad de requisitos — Seguridad y privacidad (024)

**Purpose**: Validar que los REQUISITOS de seguridad/PII de la spec están completos, claros, consistentes y medibles antes de `/speckit-plan`. Son "unit tests del inglés" del spec, no pruebas de implementación.
**Created**: 2026-07-16
**Feature**: [spec.md](../spec.md) · Gate G1: PASS (ronda 9)
**Focus**: Control de acceso (RBAC), retención/purga de PII, ciclo staging→submit, cifrado, auditoría · **Audiencia**: revisor (PR-gate previo a plan) · **Depth**: Standard

## Control de acceso (RBAC)

- [ ] CHK001 - ¿La autorización de lectura de evidencia está definida por herencia EXACTA de `getOrderDetail`, sin regla nueva ni divergente? [Consistency, Spec §FR-003]
- [ ] CHK002 - ¿Está especificada la precedencia 401→404→(410 solo autorizado en alcance) de forma no ambigua para todos los caminos denegados? [Clarity, Spec §FR-007]
- [ ] CHK003 - ¿Se documenta que `closed`/`draft` quedan fuera de alcance de TODO rol (→404) y que no existe ventana de lectura de `closed`? [Completeness, Spec §FR-009]
- [ ] CHK004 - ¿La exclusión del dispatcher (mínimo privilegio) está especificada tanto en subida como en lectura? [Coverage, Spec §FR-003/§FR-020]
- [ ] CHK005 - ¿Los requisitos garantizan que ningún no-autorizado recibe 415/413/422 (la validación de forma solo tras autz)? [Consistency, Spec §FR-020]
- [ ] CHK006 - ¿Está definida la autorización tras reasignación (nuevo dueño accede, saliente pierde) sin ambigüedad temporal? [Clarity, Spec §FR-016]

## Retención y purga de PII

- [ ] CHK007 - ¿El plazo de retención (90 días post-cierre) y la cota de latencia de purga (≤24 h) están cuantificados? [Measurability, Spec §FR-009/§FR-018]
- [ ] CHK008 - ¿La retención de `closed` está definida como ciclo de almacenamiento PURO (purga física del blob) sin semántica de acceso 410? [Consistency, Spec §FR-009/§SC-006]
- [ ] CHK009 - ¿El caso 410 está acotado exclusivamente a legacy/superado sobre orden EN ALCANCE y autorizado? [Clarity, Spec §FR-009]
- [ ] CHK010 - ¿La aserción de SC-006 (ausencia física del blob) es objetivamente verificable con instante de corte determinista? [Measurability, Spec §SC-006]
- [ ] CHK011 - ¿Están documentados como fuera de alcance los escenarios de órdenes nunca cerradas (retención indefinida)? [Assumption, Gap]

## Ciclo staging → submit → GC

- [ ] CHK012 - ¿El invariante "un `object_ref` ↔ una fila `OrderEvidence`" está declarado y es consistente entre FR-023, FR-017, FR-024 y Key Entities? [Consistency, Spec §FR-023]
- [ ] CHK013 - ¿El criterio de expiración del staging (edad por timestamp, en transacción, independiente del GC) está especificado sin dependencia circular con el GC? [Clarity, Spec §FR-023/§FR-024]
- [ ] CHK014 - ¿Se define que el submit re-valida existencia del blob DENTRO de su transacción, cerrando la carrera GC↔submit? [Completeness, Spec §FR-023]
- [ ] CHK015 - ¿El comportamiento del doble-submit del mismo dueño (409, un solo attempt) está especificado y diferenciado de la reasignación (404)? [Clarity, Spec §FR-023]
- [ ] CHK016 - ¿Los códigos deterministas del submit (404 ajeno / 422 malformado / 422 fila-existente / 422 expirado) están completos y sin solape? [Completeness, Spec §FR-023]
- [ ] CHK017 - ¿El tope ≤10 y su punto de aplicación (11.º upload→422, submit>10→422) está cuantificado? [Measurability, Spec §FR-022]

## Cifrado y no-fuga

- [ ] CHK018 - ¿El cifrado en reposo está especificado con algoritmo/modo concreto (AES-256-GCM) y aserción de test no cosmética (bytes crudos ≠ plano)? [Measurability, Spec §SC-004]
- [ ] CHK019 - ¿La gestión de la clave (secreto validado al arrancar, fail-fast, no hardcodeada) está documentada? [Completeness, Spec §Assumptions]
- [ ] CHK020 - ¿Está especificado que `object_ref`/firma interna/binario nunca aparecen en logs ni en respuestas de lectura/detalle (solo circula en upload↔submit)? [Consistency, Spec §FR-008]
- [ ] CHK021 - ¿La firma interna ≤300 s se define como propiedad del PUERTO de almacenamiento (implementada también por el mock dev/test), no de un store cloud? [Clarity, Spec §Assumptions/§SC-003]
- [ ] CHK022 - ¿El endurecimiento del binario servido (`nosniff` + Content-Type del magic-byte real) está especificado como defensa en profundidad sobre FR-019? [Completeness, Spec §FR-004]
- [ ] CHK023 - ¿El consumo por blob same-origin (sin URL/token en DOM/Referer/historial) está definido de forma verificable? [Measurability, Spec §FR-013]

## Auditoría y no-repudio (STRIDE)

- [ ] CHK024 - ¿La auditoría de lecturas autorizadas (actor/orderId/evidenceId/timestamp, sin binario) está especificada? [Completeness, Spec §FR-021]
- [ ] CHK025 - ¿Los accesos denegados (401/404) heredan la señal best-effort de `getOrderDetail`, y está claro que es el patrón existente (no auditoría durable nueva)? [Consistency, Spec §FR-007]
- [ ] CHK026 - ¿El threat model STRIDE está referenciado y cada categoría tiene un requisito o mitigación trazable? [Traceability, Spec §Assumptions]

## Validación de contenido

- [ ] CHK027 - ¿La validación de contenido real (magic-bytes) y el mapeo determinista 415 (tipo fuera de allowlist) vs 422 (contenido falseado) están completos para los 4 tipos? [Completeness, Spec §FR-019]
- [ ] CHK028 - ¿El caso `image/heic` (marca `ftyp` ISO-BMFF, sin decodificar) está especificado de forma determinista? [Clarity, Spec §FR-019]

## Consistencia con el contrato

- [ ] CHK029 - ¿Todos los requisitos son coherentes con el contrato verificado (`orders.openapi.yaml`), en especial el alcance por rol y el mapeo code→HTTP? [Consistency, Spec §Contrato]
- [ ] CHK030 - ¿La tabla de trazabilidad (RF→endpoint→test) refleja la semántica vigente (p. ej. `evidence-retention-purge`, no `-410`)? [Traceability, Spec §Trazabilidad]

## Notes

- Ítems marcados incompletos requieren actualizar la spec antes de `/speckit-plan`.
- Todos los ítems tienen referencia de trazabilidad ([Spec §…] o [Gap]/[Assumption]).
