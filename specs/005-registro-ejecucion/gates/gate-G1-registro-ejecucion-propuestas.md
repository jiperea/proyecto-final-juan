# G1 · Propuestas de remediación — `005-registro-ejecucion`

**Gate G1: FAIL (2 bloqueantes).** Panel: `revisor-cinico`, `auditor-spec-theater`, `revisor-rbac-seguridad`.
El `remediador` **propone**; la corrección la aplica el humano re-ejecutando la skill y la re-valida el siguiente pase del gate (separación de funciones).

Orden sugerido: **B1 → B2 → A1 → A2 → M1 → M2 → M4 → M6**.

---

## B1 · BLOQUEANTE — 404-vs-422 + precedencia determinista (IDOR/enumeración)

**Convergencia del panel** (H-001, T-001, S-002, S-003). Contradicción real: SC-003 mete "estado no operable" en 404; US1-AC3/US2-AC6 dicen "404/422 según visibilidad" sin criterio.

**Constitution IV (líneas 119-129) lo dirime, sin margen:** recurso **ajeno/inexistente → 404** (no filtrar existencia ni estado); orden **propia + estado de origen inválido → 422**.

**Corrección:** fijar precedencia **única** `401 → 403 (rol) → 404 (pertenencia) → 422 (estado) → 422 (payload)`, evaluada en un **guard compartido** (no duplicada por handler). Reescribir SC-003, US1-AC3, US2-AC6 y FR-003 quitando el "según visibilidad". Añadir edge case: ajena + estado no operable → **404** (pertenencia antes que estado, para no filtrar el estado de un recurso ajeno).

## B2 · BLOQUEANTE — PII cruda en `OrderAudit.reason` (Constitution XI, no excepcionable)

**S-001.** FR-002 escribe las notas del técnico como `reason` de la auditoría append-only inmutable. **Constitution XI (líneas 198-200):** los campos de texto libre de auditoría **no almacenan PII cruda** (identificadores opacos / texto saneado). FR-005 sólo sanea **forma**, no redacta contenido.

**Recomendación del remediador: Opción A.** La propia **Constitution IX (líneas 174-175)** ya dice que la retención aplica al *payload PII (fotos/notas)*, **no** al registro de auditoría → las notas son payload, no campo de auditoría.
- **A** — las notas **no** van a `reason`; `reason` recibe una referencia opaca (`execution_registered:{id}`) y las notas se persisten en una entidad aparte (`OrderExecutionNotes`, cifrable/purgable por IX). Modela bien y **resuelve M4** de paso.
- **B** — redactar PII del contenido de las notas antes de escribir `reason`. Frágil (necesita IA/regex), contradice el espíritu "sin PII cruda, nunca".

## A1 · ALTA — `OrderEvidence` sin marcador de intento (XI "versionada por intento")

Columna `attempt` **nullable base-ready** (siempre NULL en el MVP), para que el ciclo rechazo→reintento de #005 no exija una migración no-aditiva. Alinea con Constitution XI (línea 196) sin coste funcional.

## A2 · ALTA — límite de la garantía de evidencia (XV deliberado)

Nota explícita en Assumptions: "evidencia válida" = `object_ref` bien formado; **no** garantiza existencia física de la foto (eso es #007). Comunicado a #005/#006.

## MEDIA que conviene cerrar ya

- **M1** — rechazar `object_ref` **duplicados** en el array (evita inflar el conteo) → 422 `INVALID_EVIDENCE`.
- **M2** — aclarar en FR-005 que esta feature valida **forma**, no redacta contenido (el fondo es la separación de B2).
- **M4** — resuelto por B2 (reason deja de recibir texto libre).
- **M6** — consolidar en Assumptions la lista de valores diferidos a plan (MAX evidencias, long. notas, patrón `object_ref`, allowlist, size máx).

## MEDIA a dejar constancia (no bloquean)

- **M5** — verificar contra el código real de 002b que las dos transiciones ya son legales con guard de pertenencia.
- **M7** — confirmar que `applyTransition` aísla bajo concurrencia (FOR UPDATE/serializable) o dejar constancia de que es garantía de #008.
- **M8** — retención de `object_ref` (IX) y RBAC de lectura futura de `OrderEvidence`/`OrderAudit` (XI).
