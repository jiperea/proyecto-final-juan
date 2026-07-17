<!-- SPECKIT START -->
Plan activo: `specs/025-evidence-viewer-lightbox/plan.md` (**solo frontend, presentación**). **025** cierra el hueco de 024: al pulsar una evidencia abre un **lightbox** a tamaño completo + **carrusel** (anterior/siguiente, «k de N»), reutilizando el fetch→blob de 024 (`getOrderEvidence`/`items[]`) sin exponer la URL en el DOM, y el patrón de modal accesible `ConfirmDialog` (focus-trap/Esc/retorno de foco, solo tokens). Invariante: **0 backend/contratos/RBAC/endpoint/seed** (autz server-authoritative heredada exacta). **G1 ✅ · G2 ✅ · G3 ✅ PASS**. **US3 «seed con blob real» descopada a spec propia** en G1 por entanglement con la topología del entorno dev —`make seed` puebla `fieldops_test`, no la `fieldops` que ve el navegador; storage dir/volúmenes; [[make-seed-wrong-db-and-us3-descope]]— (corte anti-espiral XV). G1 (5 rondas), G2 (6 rondas: strings reales de errors.ts, `disabled` nativo, colapso de errores anti-oráculo, FR-014 por remount `key={orderId}`), G3 (2 rondas: bloqueante a11y —indicador con `aria-live`— + tipo derivado del contrato + layout lightbox + retry restaurado). **Implementación completa** (18 tareas, TDD Red-primero): `EvidenceViewer` (modal role=dialog reutilizando patrón `ConfirmDialog`, fetch→blob sin URL en DOM, colapso 410/offline/FALLBACK, carrusel «k de N» con `disabled` nativo, revoke en cierre/nav/desmontaje, guard de carrera). Front **383/383** verde; tsc/eslint/stylelint limpios; 0 backend/contratos/RBAC/seed. **Lista para PR a develop.** Pendiente NO bloqueante: verificación visual Playwright del lightbox (360/1280) — requiere login del seed. Para ver imagen en dev hoy: subir foto como técnico (flujo 024). — Feature previa 024 (`specs/024-evidence-binary-signed-url/plan.md`, **full-stack, contract-first, PII-sensible**) **mergeada a develop (PR #24)**: hoy la evidencia son solo metadatos (`count`/`content_types`) y no se puede **abrir** la foto. Añade `uploadOrderEvidence` (multipart, valida allowlist/tamaño/contenido real, **almacena blob cifrado AES-256-GCM en staging**), `getOrderEvidence` (sirve el binario **same-origin por sesión**; firma ≤300 s **solo interna** backend↔store, sin token de cliente) y amplía `getOrderDetail.evidence` con `items:[{evidence_id,content_type}]`. `submitOrderExecution` **no cambia su cuerpo** (referencia los `object_ref` staged → crea filas `OrderEvidence`). Claves de diseño (r8, Principio XV): autz **heredada EXACTA** de `getOrderDetail` (404 uniforme, sin RBAC nueva); `closed` **no se sirve nunca** (404), retención 90 d = purga **física** sin semántica 410; **un `object_ref` ↔ una fila** (GC seguro); TTL staging por edad en transacción. **Puerto de almacenamiento nuevo** (`StoragePort`; adaptador fs+crypto en `infra/storage/`, S3-like en prod); dominio puro. **G1 ✅ · G2 ✅ · G3 ✅ PASS**. G1 (9 rondas; ronda 8 destapó S-008 —retención de `closed` inalcanzable por contradicción con el contrato— resuelto por corte de alcance «purga sin acceso»; **lección: la espiral se corta simplificando, no acumulando salvaguardas — diff net-negativo**). G2 (huecos de cobertura de tasks: +tests cycle-replace/reassign/atomic-gc, dedup silencioso→422 estricto). **Implementación completa** (52 tareas, TDD por historia): `StoragePort`+adaptador AES-256-GCM, `uploadOrderEvidence` (multipart, autz-primero), `getOrderEvidence` (200/404/410 por sesión, sin fuga), `items[]` en detalle, submit re-verifica refs en transacción, tabla `EvidenceReadAudit`, jobs GC+retención 90d, front `EvidenceTile` (fetch→blob). G3 (I-001 503 fail-closed + I-002 + S-003 auditoría de subida remediados; S-001/S-002 aceptados documentados). Backend evidencia 79/79 + front 340/340 verdes; tsc/eslint/stylelint limpios; suite serial con ~2 flakes PREEXISTENTES (pasan aislados, no de 024). **Mergeada a develop (PR #24)** (gitleaks: falso positivo de clave dummy de test resuelto por allowlist acotado). — Feature previa FE-9 (`023-front-tecnico-list`, presentación): cierra la fidelidad que FE-8 dejó en 2 pantallas — **tarjeta de la lista del técnico** (código mono + chip + nombre + fila de meta: cliente «—» / técnico «Tú»|UUID8|«Sin asignar») y **detalle** (cabecera código mono + nombre; notas en tarjeta; evidencia en tiles «Imagen N» por `count`). Anclada al **contrato verificado** (`orders.openapi.yaml`: `assigned_to` uuid opaco, `notes` por rol, `count==content_types.length` enum imágenes). Invariante: **0 backend/contratos/RBAC** (listado+detalle server-authoritative). **G1 ✅ PASS** (5 rondas; lección: verificar el contrato antes de especificar sobre datos). Siguiente: `/speckit-tasks` → analyze → **G2** → implement → G3. Verificación visual con Playwright MCP requiere **login del seed** (pedir al usuario). — Feature previa FE-8 (`022`) **mergeada a develop (PR #22)**; login perfecto validado; resto de pantallas dividido en specs nuevas (esta es la 1ª). [ex-plan FE-8:] `specs/022-front-visual-fidelity-preview/plan.md` (sin research/data-model/contracts — feature de **presentación**, sin endpoints/IA/backend/contratos). **FE-8**: **réplica literal** del artifact de exploración ([[front-preview-artifact]]) en TODAS las pantallas (login, lista técnico, detalle, registrar ejecución, master-detail de oficina) — tokens (fondo gris, acento vivo #DC5A24, chips del preview con in_progress TEAL + punto, bordes) + componentes/maquetación; **construye** el chrome de oficina que falte (topbar buscador/avatar, cabecera de tabla, fila con barra de acento). Cierra lo que FE-5/FE-7 dejaron "parecido pero no igual" (solo estilos/acento, no estructura). Decisiones clarify: acento **literal** con **excepción AA acotada y anotada** (el brief no exige AA; es "objetivo" de constitución) · responsive por **viewport** (no rol) · filtro **en cliente** (segmento «Activas/Todas» + buscador; la búsqueda pone el segmento en «Todas») · tarjeta IA replica **estilo**, estado runtime · **paginación diferida**. Invariante: **no toca backend/contratos/RBAC**. **G1 ✅ · G2 ✅ · G3 ✅ PASS** (G1 8 rondas 19→6 huecos, bloqueante SC-004↔FR-010 resuelto; G2 consistencia 2 rondas; G3 impl 1 pase, 0 bloq/0 altas). Implementación **solo frontend** (tokens + Segmented + useOrderFilter + OfficeTopbar + vistas); `tsc/eslint/stylelint/build` + **vitest 320/320** verdes (incl. 9 Red + axe). **2 desviaciones documentadas**: 4 chips claro oscurecidos mínimamente para AA (chip = texto); evidencia muestra recuento (contrato sin URL firmada). **Lista para PR a develop.** Pendiente único = **T026** (capturas Playwright MCP autenticadas → aprobación humana de fidelidad en el PR). Historial front: FE-7 (021-front-dual-accent) cerrada+**merge** (PR #20); FE-6 (020) merge (PR #19); FE-5 (017-reskin) merge; FE-1..4 cerradas. Tooling: **modo dev con HMR** (`docker-compose.override.yml` + `make dev`/`build`, PR #21 merge). M12 CI/CD cerrado; agentes dev-* + Playwright MCP (PR #18).

Feature 010 (transversal, ADR-0004): **Pipeline CI/CD (reto M12)**. Formaliza en SDD la fase DevOps (antes solo gobernada por Principio XVI + `docs/pipeline-spec.md`, que pasa a documento de apoyo). Ramas `feature/* → develop → main`; flujos separados por componente (`paths:`); PR-gate M9 + guardián de Constitución; CI develop (imagen snapshot→GHCR) / main (semver + Release); **no-rebuild**; CD a **Render + Neon**, entornos **dev/pre/prod** (faseado: Fase 1 dev, Fase 2 pre/prod). Guardián **determinista always-on** + **agente vía API opt-in y desactivado** (excepción única a NFR-P03). G1 ✅ PASS (spec endurecida por el panel adversarial); delta implementación↔spec escalado a G3. Para stack/estructura/fases, leer ese plan y `docs/pipeline-spec.md`.
Para tecnologías, estructura y comandos, leer ese plan.
<!-- SPECKIT END -->

# FieldOps — Guía operativa para Claude

> **La fuente de verdad es la constitution** (`.specify/memory/constitution.md`). Ante conflicto,
> manda la constitution. Esto es un resumen operativo para trabajar rápido y bien en este repo.

## Reglas de oro

1. **SDD real, no a mano.** Usa las skills de Spec Kit (`/speckit-specify`, `/speckit-clarify`,
   `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`). No redactes artefactos
   Spec Kit a mano.
2. **Una rama por spec** (la crea la extensión git en `before_specify`). Commits separados
   `spec → plan → tasks → código` (**Conventional Commits**: `feat/fix/docs/chore/test/refactor`).
3. **Gates adversariales** (extensión `speckit-gate`) tras `clarify` (G1), `analyze` (G2) e
   `implement` (G3), **acumulativos**; se avanza solo con **0 BLOQUEANTES**. No commitear con bloqueantes.
4. **Sin API de pago.** Todo por el plan (CLI `claude -p`): gate.sh, evals de promptfoo (provider
   `claude -p`), feature IA en dev (`AI_PROVIDER=claude-cli`). Tests mockean el proveedor.
5. **Deterministic-first.** Verifican las herramientas (`tsc`, `eslint`, `vitest`, `promptfoo`); Claude
   lee resultados y corrige. No hagas de linter a mano. Model tiering: Haiku mecánico / Sonnet revisión /
   Opus lo difícil (ver `docs/11`).

## Stack (Constitution §Stack)

- **TypeScript 5 strict** · Node 18+ · **Express 4** con **arquitectura hexagonal** (`domain/` puro,
  `handlers/`, `infra/`; el dominio NO importa Express/Prisma/SDK-IA).
- **PostgreSQL 16 (Prisma) en todos los entornos vía Docker** (paridad; migraciones Prisma Migrate).
- **Zod** derivado del contrato · **OpenAPI 3.1** en `contracts/` (contract-first, rutas bajo **`/v1`**).
- **Vitest** + Supertest · **pino** · **Docker + Docker Compose**.
- **Seguridad/robustez:** helmet (HSTS/CSP) + CSRF + rate-limit (login e IA); config validada al
  arrancar (Zod, fail-fast); FSM explícito; auditoría atómica (misma transacción); correlation-ID.
- **Auth:** JWT access (memoria) + refresh opaco (cookie HttpOnly, revocable), **argon2id** (ADR-0002).

## Cómo trabajar una feature

`/speckit-specify` (crea rama) → `/speckit-clarify` → **G1** → `/speckit-checklist` → `/speckit-plan`
→ `/speckit-tasks` → `/speckit-analyze` → **G2** → `/speckit-implement` + tests → **G3** → merge.

- **FRs en EARS**; NFRs cuantificados; **Success Criteria medibles** (eval promptfoo).
- **Trazabilidad** RF→endpoint→tarea→test en `docs/traceability.md`.
- **TDD fase Red** (commit de test en rojo antes de implementar). Cobertura dominio ≥80% y servicios ≥80%,
  100% contratos y transiciones. BD real (Postgres docker-compose, BD de test independiente). E2E solo
  con justificación. Detalle en `docs/12`.
- **Errores de dominio con `Result/Either`** (no throw); contrato de errores `{code,message,details,agent_action}`.
- **Seguridad:** RBAC en backend (rol + `assigned_to` + estado de origen), 401/403/404/409; PII cifrada,
  URLs firmadas ≤300 s, no en logs, minimizada antes de la IA; auditoría append-only.

## Documentación y analítica

- Mapa de `docs/` y bitácora: `docs/README.md`. Roadmap de features: `docs/06-roadmap.md`.
- Panel de agentes de verificación en `.claude/agents/` (independientes de Spec Kit).
- Analítica de tokens (RTK/ccusage, sin API): `informes/` + skill `/informe-tokens` + hook SessionEnd.

## No hacer

- No usar la API de pago. No redactar artefactos Spec Kit a mano. No saltarse gates ni exceptuar
  bloqueantes/seguridad. No `any` sin `// JUSTIFICACIÓN:`. No importar infra desde `domain/`.
  No default exports. No commitear secretos (usa `.env`, ver `.env.example`).
