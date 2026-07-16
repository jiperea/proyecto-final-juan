# Gate G3 — 023-front-tecnico-list (FE-9)

**Veredicto: ✅ PASS** (0 bloqueantes, **0 altas**). Panel: revisor-implementacion · revisor-rbac-seguridad · revisor-consistencia. Acumulativo sobre G1+G2. 1 pase.

## Verificación determinista
- `tsc` ✅ · `eslint` ✅ · `stylelint` ✅ · `build` ✅ · **`vitest` 336/336** (incl. 4 tests Red de FE-9; 0 tests existentes tocados).
- Alcance del diff: producción **solo** en `frontend/src/features/orders/**` (`OrderList`, `OrderDetailView`, `resolveAssignee`, `orders.css`) + import de solo-lectura de `features/auth/session`; docs = `traceability.md`; **0** backend/contracts/domain; RBAC intacto (`rbac-reskin-regression` verde).
- Trazabilidad: `acceptance-check.sh` OK (211 filas FR con tarea+test).

## Hallazgos MEDIA (5) — disposición
| ID | Tema | Resolución |
|----|------|-----------|
| **I-001** | Capturas de fidelidad (FR-009) no evidenciadas en G3 | **Checkpoint humano** (T013): requiere login del seed; se aporta al PR para la aprobación humana. Esperado. |
| **I-002** | En la fila de oficina el técnico (UUID8) queda bajo la cabecera «Cliente» de FE-8 | **DISPUESTO** (refinamiento de la vista de oficina): desalineación menor de cabecera heredada de FE-8; el foco de FE-9 es la lista del técnico + detalle. Candidato a la spec futura de fidelidad de oficina. |
| **S-001** | En oficina/supervisor el UUID8 del asignatario es superficie deliberada (no solo guarda) | **Aceptado**: `assigned_to` es **UUID opaco sin PII** (contrato); mostrarlo a supervisor/dispatcher (que ya ven esas órdenes) no expone dato sensible; no hay nombre que ocultar. Documentado. |
| **K-001** | Checkboxes [Red] (T002/5/7/9) sin marcar pese a existir los tests | **CORREGIDO**: marcados [X] (los Red se escribieron y pasaron por rojo, commit 956f1ec). |
| **K-002** | El caso de fila de oficina estaba en el paréntesis de T004, no en T002 | Nota de redacción; la rama está cubierta por el test de `order-card-meta` (caso `order-item--row` con `assigned_to`≠usuario → UUID). |

## Desviación/deuda conocida (heredada, para el checkpoint humano)
- Evidencia sin imagen real (contrato sin URL firmada) → tiles placeholder «Imagen N».
- Vista de oficina: alineación de cabecera «Cliente»/«Técnico» (I-002) → refinamiento futuro.

> **Checkpoint pendiente (humano)**: **T013** — capturas Playwright MCP autenticadas (lista del técnico móvil + detalle técnico/supervisor, claro/oscuro) para la aprobación humana de fidelidad al abrir/mergear el PR.

> **023-front-tecnico-list lista para PR a `develop`** (con el checkpoint de fidelidad y las notas de oficina para el dueño del brief).
