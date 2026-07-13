# Gate G2 — 004-orden-reasignacion (base MAGRA)

**Fase**: G2 (tras `/speckit-analyze`) · **Panel**: `revisor-consistencia` + `revisor-cinico` + `revisor-rbac-seguridad`
**Artefactos**: `spec.md` (G1 PASS) + `plan.md` + `research.md` + `data-model.md` + `tasks.md` + `contracts/orders.openapi.yaml`
**Fecha**: 2026-07-13

> **Contexto**: la spec pesada anterior sufrió 4 pasadas de G2 con turbulencia (sobredimensionada, XV). Tras el
> **reset** (spec reformulada magra → G1 PASS), se regeneraron plan/tasks/contrato/data-model **magros** y se
> re-corrió G2 sobre esa base limpia.

## Veredicto: **PASS** — 0 BLOQUEANTES

- **revisor-consistencia**: **APROBADA** ("uno de los conjuntos más internamente coherentes revisados"):
  cobertura FR/SC 1:1 con tareas/tests; contrato 200/401/403/404/422/500 idéntico en spec/plan/tasks/YAML (sin
  409/If-Match); write-side/OrderAudit coherente. 2 BAJA (K-001 asunción orden-no-borrada → añadida en plan;
  K-002 trazabilidad diferida a T033, prevista).
- **revisor-rbac-seguridad**: **APROBADA**: orden 401→403→404→422 preservado, actor server-side, no-fuga de
  reason, 500 saneado, auditoría veraz bajo concurrencia. Hallazgos cerrados: S-001 (actorId en el cmd del
  puerto), S-002 (guarda null-safe `IS DISTINCT FROM` para orden huérfana).
- **revisor-cinico**: 1ª pasada REQUIERE_CAMBIOS (0 BLOQ; 4 ALTA + MEDIA/BAJA), todas de correctitud de
  diseño; remediadas → **re-verificación APROBADA**. Cierres:
  - H-001 (ALTA): guarda `IS DISTINCT FROM` (null-safe) → orden huérfana reasignable.
  - H-002 (ALTA): `down.sql` reverso parcial documentado (append-only no re-NOT-NULL, M10).
  - H-003 (ALTA): CHECK constraints de invariantes por `event_type` en la migración.
  - H-004 (ALTA): `applyTransition` **intacto** (optimista); sin primitiva de locking compartida forzada.
  - H-005 (MEDIA): arch-test acotado a mutaciones de órdenes existentes (creación futura, nota cruzada).
  - H-006 (BAJA): precedencia 0-filas status→404 antes que mismo-destino→422.
  - H-101 (ALTA, re-verify): `plan.md` describía "primitiva compartida" contradiciendo research/tasks →
    corregido (plan alineado: applyTransition no cambia). H-102/H-103 (MEDIA/BAJA): notas del CHECK y
    referencia K-001, corregidas.

**Deudas / stretch aislado (XV)**: BL-001 (If-Match/409), BL-063/064/066 (hardening de timing/errores),
BL-067 (gobernanza XI accesos denegados), BL-002/051/055 (heredados). Ninguna bloquea el MVP.

**Se avanza a `/speckit-implement`** (TDD fase Red → verde → G3).
