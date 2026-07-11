# Research — 002b Order FSM + auditoría append-only (Phase 0)

> Decisiones técnicas. La spec congeló el comportamiento (G1); aquí la mecánica, reutilizando 001/002a.

## D1 · FSM como tabla de datos en el dominio

- **Decisión**: la FSM es una **tabla/estructura de datos** en `domain/order/transition-table.ts`:
  conjunto de pares legales `{from,to}` (assigned→in_progress, in_progress→pending_review,
  pending_review→closed, pending_review→in_progress). `isLegalTransition(from,to)` la consulta.
- **Rationale**: explícita, testeable exhaustivamente, sin lógica dispersa; base para 003/004/005.
- **Alternativas descartadas**: `if/switch` disperso por feature (duplicación, drift).

## D2 · applyTransition: UPDATE condicional atómico + guardas de pertenencia

- **Decisión**: `applyTransition` ejecuta en el repo (`$transaction` interactiva): un **UPDATE condicional**
  `UPDATE orders SET status=?, version=version+1 WHERE id=? AND version=? AND status=? [AND <guardas>]`. Si
  `count===1` → inserta `OrderAudit` en la MISMA transacción; commit. Si `count===0` → **re-lee** la orden y
  clasifica (best-effort): no existe→ORDER_NOT_FOUND; version≠→VERSION_CONFLICT; status≠origen→INVALID_TRANSITION;
  guarda no satisfecha→lo mapea el llamador. Las **guardas de pertenencia** (p. ej. `assigned_to=?`) las inyecta
  el llamador (003/004/005) para revalidar atómicamente (cierra TOCTOU, H-012).
- **Rationale**: un solo statement condicional garantiza no-lost-update sin locks explícitos; la auditoría en la
  misma transacción da atomicidad (FR-004). La legalidad se comprueba en el propio WHERE (`status=<origen>`),
  no en una lectura previa (evita TOCTOU de legalidad).
- **Alternativas descartadas**: SELECT-then-UPDATE (TOCTOU); `SELECT … FOR UPDATE` (más pesado; innecesario con
  el conditional update); mockear el ORM para atomicidad (viola Const. VII).

## D3 · Atomicidad verificable sin mock (Const. VII)

- **Decisión**: la atomicidad (FR-004/SC-004) se prueba forzando el fallo del insert de auditoría con un
  **`actor_id` inexistente** → viola la FK dentro de `$transaction` → rollback completo → la orden NO
  transiciona (status/version intactos, 0 filas de auditoría). Todo contra Postgres real.
- **Rationale**: fallo real de BD, sin mockear infraestructura.

## D4 · OrderAudit append-only a nivel de BD

- **Decisión**: la **migración** aplica `REVOKE UPDATE, DELETE ON order_audit FROM <rol_app>` (o un trigger
  `BEFORE UPDATE OR DELETE` que lanza excepción). El repo sólo expone `insert`. Verificable: un `UPDATE`/`DELETE`
  directo falla con error de BD (SC-003).
- **Rationale**: enforcement real (no por convención); evidencia forense no alterable ni por acceso directo.
- **Alternativas descartadas**: inmutabilidad sólo por ausencia de método (evadible por otro código/DBA).

## D5 · Único punto de escritura de status/version

- **Decisión**: sólo `applyTransition` (repo de transición) escribe `status`/`version`. El repo de 002a
  (`OrderRepository`) es solo-lectura para esos campos. Test de arquitectura: ningún otro fichero de infra
  contiene un `update({... status ...})` sobre `order` fuera del repo de transición.
- **Rationale**: garantiza que ninguna transición evade la FSM/auditoría (FR-006/H-004).

## D6 · Errores de dominio

- **Decisión**: nuevos códigos `INVALID_TRANSITION`(422), `VERSION_CONFLICT`(409), `ORDER_NOT_FOUND`(404) en el
  catálogo `ErrorCode` de 001 (error-mapper los mapea). `reason` NUNCA en `details`/`agent_action` ni en logs
  (redacción de 001 ya cubre `reason` como campo; se verifica).
- **Rationale**: contrato accionable uniforme reutilizable por 003/004/005.
