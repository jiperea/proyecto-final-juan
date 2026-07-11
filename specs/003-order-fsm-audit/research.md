# Research — 002b Order FSM + auditoría append-only (Phase 0)

> Decisiones técnicas. La spec congeló el comportamiento (G1 re-entrada APROBADA tras remediar G2); aquí la
> mecánica, reutilizando 001/002a. **Unificado con spec ↔ data-model** (orden de clasificación, GUARD_UNMET,
> ACTOR_INVALID, trigger, FR-009).

## D1 · FSM como tabla de datos en el dominio

- **Decisión**: la FSM es una **tabla/estructura de datos** en `domain/order/transition-table.ts`: conjunto de
  pares legales `{from,to}` — `assigned→in_progress`, `in_progress→pending_review`, `pending_review→closed`,
  `pending_review→in_progress` (rechazo). `isLegalTransition(from,to)` la consulta.
- **`draft` no tiene transición saliente** en el alcance del proyecto (spec Edge Cases / G1:H-001): la
  creación/alta de órdenes está fuera del proyecto; las órdenes entran directamente en su estado operativo.
  `draft` es estado semilla ilustrativo; **ninguna** feature del roadmap transiciona `draft→assigned`, por lo
  que su ausencia es intencional y no deja órdenes atascadas.
- **Rationale**: explícita, testeable exhaustivamente, sin lógica dispersa; base para 003/004/005.
- **Alternativas descartadas**: `if/switch` disperso por feature (duplicación, drift).

## D2 · applyTransition: UPDATE condicional atómico + guarda tipada

- **Decisión**: `applyTransition` ejecuta en el repo (`$transaction` interactiva) un **UPDATE condicional**:
  `UPDATE orders SET status=?, version=version+1 WHERE id=? AND version=? AND status=<origen legal> [AND <guarda>]`.
  Si `count===1` → inserta `OrderAudit` en la MISMA transacción; commit. La **guarda** es un objeto **tipado
  seguro** (`{ assignedTo?: string }`) que el repo traduce a un `where` **parametrizado** de Prisma (nunca SQL
  crudo del llamador; G2:H-007). La legalidad se comprueba en el propio WHERE (`status=<origen>`), no en una
  lectura previa (evita TOCTOU de legalidad); la guarda de pertenencia se revalida dentro de la misma condición
  atómica (cierra TOCTOU de pertenencia, G2:S-004).
- **Clasificación cuando `count===0`** — **re-lectura best-effort en ORDEN DETERMINISTA** (unificado con spec
  FR-003 y data-model, G2:H-002/G2:K-004): (1) no existe → `ORDER_NOT_FOUND` (404); (2) `version` distinta →
  `VERSION_CONFLICT` (409); (3) `status` no es origen legal → `INVALID_TRANSITION` (422); (4) existe + version +
  status OK pero la guarda no se cumple → **`GUARD_UNMET`** (resultado de dominio propio; mapeo HTTP gobernado
  por el llamador vía FR-009). Bajo concurrencia el código es diagnóstico best-effort (el estado puede cambiar
  entre UPDATE y re-lectura); 003/004/005 no asumen correspondencia 1:1 exacta.
- **Rationale**: un solo statement condicional garantiza no-lost-update sin locks explícitos; la auditoría en la
  misma transacción da atomicidad (FR-004).
- **Alternativas descartadas**: SELECT-then-UPDATE (TOCTOU); `SELECT … FOR UPDATE` (más pesado, innecesario);
  mockear el ORM (viola Const. VII).

## D3 · Concurrencia optimista = correctness (independiente del scheduling)

- **Decisión**: la propiedad de consistencia (SC-002) es: dadas **N transiciones con la misma
  `expectedVersion`** sobre la misma orden, **exactamente una** tiene éxito (`version`+1, 1 auditoría) y el
  resto afecta 0 filas → `VERSION_CONFLICT`. La garantiza el UPDATE condicional (el predicado `version=…` hace
  que el escritor tardío no encuentre fila) **con o sin solape** — el bloqueo de fila de Postgres serializa las
  escrituras y `version` decide el ganador. Test: `Promise.all` de dos `applyTransition` con la misma
  `expectedVersion` (1 ok + 1 `VERSION_CONFLICT` + 1 auditoría) **más** un caso secuencial determinista.
- **Rationale**: la corrección **no depende del scheduling**; se evita el claim infalsable "el test falla si se
  serializa" (G1:T-001). La exposición `If-Match`→409 al cliente es *stretch* (003/004; constitution → BL-050).

## D4 · Atomicidad verificable sin mock + ACTOR_INVALID (Const. VII)

- **Decisión**: la atomicidad (FR-004/SC-004) se prueba forzando el fallo del insert de auditoría con un
  **`actor_id` inexistente** → viola la FK dentro de `$transaction` → rollback completo → la orden NO
  transiciona (status/version intactos, 0 filas de auditoría). El test **además** aserta que el resultado de
  dominio es **`ACTOR_INVALID`** y que el **mensaje crudo de Postgres NO se propaga** (G1:H-009). Todo contra
  Postgres real.
- **Rationale**: fallo real de BD, sin mockear infraestructura; en producción, un fallo de FK (usuario
  borrado/revocado o bug del llamador) es accionable y no filtra detalles de esquema/SQL.

## D5 · OrderAudit append-only a nivel de BD — TRIGGER (no REVOKE)

- **Decisión**: la **migración** crea una función + **TRIGGER `BEFORE UPDATE OR DELETE ON order_audit`** que
  lanza excepción. Se descarta `REVOKE UPDATE, DELETE` porque **el rol de la app (`fieldops`) es propietario de
  la tabla** y un `REVOKE` **no afecta al owner** en Postgres (sería un test verde-falso — G2:S-002). El repo
  sólo expone `insert`. La migración **`down`** hace `DROP TRIGGER` + `DROP FUNCTION` antes del `DROP TABLE`
  (reversible). Verificable: un `UPDATE`/`DELETE` directo **con el rol de runtime de la app** falla con error de
  BD (SC-003) — el test NO usa un superusuario distinto.
- **Rationale**: enforcement real independiente del propietario; evidencia forense inalterable.
- **Alternativas descartadas**: `REVOKE` (inefectivo contra el owner con rol único); inmutabilidad sólo por
  ausencia de método (evadible por otro código/DBA).
- **Diferido**: procedimiento correctivo de PII / mantenimiento estructural (deshabilitar trigger en migración
  controlada) + health-check de arranque que verifique la presencia del trigger → BL-055.

## D6 · Único punto de escritura de status/version

- **Decisión**: sólo `applyTransition` (repo de transición) escribe `status`/`version`. El repo de 002a
  (`OrderRepository`) es solo-lectura para esos campos. Test de arquitectura por **búsqueda estática**
  (grep/AST): ningún `.update(...)`/`$executeRaw` que escriba `status`/`version` en `order` fuera de
  `order-transition-repository.ts` (incluye confirmar que el repo de 002a **no** los escribe).
- **Rationale**: garantiza que ninguna transición evade la FSM/auditoría (FR-006/H-004).

## D7 · Errores de dominio

- **Decisión**: catálogo `ErrorCode` (extiende 001): `INVALID_TRANSITION`(422), `VERSION_CONFLICT`(409),
  `ORDER_NOT_FOUND`(404), **`GUARD_UNMET`** (sin status HTTP fijo; mapeo por el llamador vía FR-009) y
  **`ACTOR_INVALID`** (fallo de FK de actor_id; error interno, sin filtrar BD). `reason` **NUNCA** en `details`/
  `agent_action` ni en logs (la redacción de 001 se extiende a `reason` y a errores de BD; se verifica en SC-006).
- **Rationale**: contrato accionable uniforme reutilizable por 003/004/005.

## D8 · FR-009 — contrato de no-enumeración para consumidoras (diseño, no implementado en 002b)

- **Decisión**: los códigos de dominio de D2/D7 son **diagnóstico interno**, no respuesta directa al cliente.
  002b los documenta como contrato para 003/004/005 (que sí tienen endpoint): aplica **tras** el 401 de auth de
  001; **actor no autorizado sobre la orden → 404 con body/mensaje uniforme** (indistinguible de
  ORDER_NOT_FOUND, sin `code` interno); **actor autorizado → 409/422 y `GUARD_UNMET`→403**. Regla uniforme para
  las tres features hermanas (evita divergencia y oráculo de enumeración, G1:S-001/G1:H-001).
- **Rationale**: cierra la fuga de existencia/estado por status y por body a actores no autorizados; el
  side-channel de tiempo entre casos se acepta como residual en este slice (acotar en 003/004/005, BL-056).
- **Alcance**: 002b **no** implementa FR-009 (no tiene endpoint); se verifica en los gates de 003/004/005.
