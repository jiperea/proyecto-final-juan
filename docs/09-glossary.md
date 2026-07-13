# 09 · Glosario (lenguaje ubicuo)

> Términos del dominio FieldOps con una definición **única y precisa**. Refuerza el Principio V
> (anti-ambigüedad): specs, contrato y código usan estos términos con el mismo significado, evitando
> deriva terminológica. Si un término no está aquí y aparece en una spec, hay que añadirlo.

## Roles

- **Dispatcher:** organiza el trabajo y **reasigna** órdenes entre técnicos.
- **Technician:** ejecuta la orden en campo; **inicia** el trabajo y **registra la ejecución** con evidencia.
- **Supervisor:** revisa órdenes en `pending_review` y las **aprueba** o **rechaza**.

## Entidad Order y estados

- **Order (orden):** unidad de trabajo de campo. Tiene un técnico asignado (`assigned_to`), evidencia e
  historial de auditoría.
- **Estados:** `draft → assigned → in_progress → pending_review → closed`.
  - **draft:** creada, sin asignar (fuera del slice; datos semilla).
  - **assigned:** asignada a un técnico, trabajo no iniciado.
  - **in_progress:** el técnico ha iniciado el trabajo.
  - **pending_review:** ejecución enviada, a la espera del supervisor.
  - **closed:** aprobada por el supervisor (estado final).

## Acciones (transiciones)

- **Reasignar:** el dispatcher cambia `assigned_to`. Estados reasignables: `assigned`, `in_progress`.
- **Iniciar trabajo:** el técnico asignado pasa `assigned → in_progress`.
- **Registrar ejecución:** el técnico asignado envía la ejecución (≥1 foto válida) → `pending_review`.
- **Aprobar:** el supervisor pasa `pending_review → closed`.
- **Rechazar:** el supervisor devuelve `pending_review → in_progress` con **motivo**.

## Conceptos

- **Evidencia:** fotos del técnico asociadas a un intento de ejecución. Contiene PII. *(En la feature 005 se
  modela como entidad propia `OrderEvidence`, separada de las **notas** —`OrderExecutionNotes`— por mandato de
  Constitution XI; no conflar ambas.)*
- **Foto válida:** (umbral definido en la spec) formato soportado + tamaño ≤ límite. **MVP #005** (validación
  *por referencia*): `object_ref` bien formado + `content_type` en allowlist + `size_bytes` ≤ máximo, **sin**
  decodificar ni comprobar existencia del binario. **Decodificabilidad y transporte binario** llegan en **#007**.
- **Evidencia suficiente (IA):** (umbral definido en la spec) mínimo de fotos/notas para que el
  asistente resuma; por debajo, declara "evidencia insuficiente" y no inventa.
- **PII:** datos personales de cliente (nombre, dirección, matrícula, ubicación, rostros en fotos) y, por
  extensión, **datos operativos sensibles** tratados con la misma protección (IX): notas de ejecución del técnico
  (`OrderExecutionNotes.notes`) y referencias de objeto (`object_ref`) — nunca en logs/errores; cifrado/purga por IX.
- **Auditoría:** registro **append-only** e inmutable de cada transición (actor, timestamp, acción,
  motivo, referencia a evidencia) y de los accesos denegados. *(En 005 el `motivo`/`reason` de una transición
  puede ser un **marcador opaco constante** —p.ej. `"execution_registered"`—, nunca PII cruda —XI—; y la
  "referencia a evidencia" se materializa como `OrderEvidence.audit_id → OrderAudit` —la evidencia referencia a la
  auditoría, no al revés—.)*
- **Matriz rol×alcance:** política centralizada que define qué órdenes ve/opera cada rol.
- **Gate (G1/G2/G3):** punto de control adversarial tras clarify / analyze / implement.
- **Success Criteria (SC):** criterios medibles de éxito de una spec, evaluados como métricas.
