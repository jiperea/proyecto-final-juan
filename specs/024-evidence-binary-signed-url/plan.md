# Implementation Plan: Evidencia fotográfica — binario y visualización por URL firmada (024)

**Branch**: `024-evidence-binary-signed-url` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/024-evidence-binary-signed-url/spec.md` · **Gate G1: PASS** (ronda 9)

## Summary

Cerrar la deuda «#007-subida»: hoy la evidencia solo existe como metadatos (`EvidenceMeta`: `count`+`content_types`) y el técnico/supervisor no puede **abrir** la foto. Esta feature añade (a) un endpoint nuevo **`uploadOrderEvidence` multipart** que valida allowlist/tamaño/contenido real y **almacena el blob cifrado en staging**; (b) **`getOrderEvidence`** que sirve el binario **same-origin autenticado por sesión** (sin token de cliente; firma ≤300 s **solo interna** backend↔store); (c) `getOrderDetail` amplía `EvidenceMeta` con `items:[{evidenceId,content_type}]`. `submitOrderExecution` **no cambia su cuerpo JSON** (referencia los `object_ref` staged → crea filas `OrderEvidence`). Enfoque técnico: **puerto de almacenamiento nuevo** (adaptador local/mock en dev/test que honra firma-con-TTL y cifrado AES-256-GCM; S3-like en prod), autorización **heredada exactamente** de `getOrderDetail` (404 uniforme), y **un `object_ref` ↔ una fila** para que el GC sea seguro (decisión r8, Principio XV).

## Technical Context

**Language/Version**: TypeScript 5 strict · Node 18+

**Primary Dependencies**: Express 4 (hexagonal) · Prisma (PostgreSQL 16) · Zod (derivado del contrato) · `node:crypto` (AES-256-GCM + HMAC de firma interna) · parser multipart en streaming (`busboy`, límite duro 25 MiB) · Front: React 18 + Vite + TanStack Query

**Storage**: PostgreSQL 16 (metadatos `OrderEvidence` + auditoría, ya existente) · **NUEVO puerto de almacenamiento de blobs** (`StoragePort`): adaptador **filesystem local/mock** en dev/test (cifrado AES-256-GCM + firma HMAC con expiración), compatible con **S3-like** en prod. No existe hoy ningún puerto de storage (se crea desde cero).

**Testing**: Vitest + Supertest con **Postgres real** (servicio `db-test`, `docker-compose.yml`; `fileParallelism:false`) · RTL + vitest-axe en front · contract tests por `operationId × código`.

**Target Platform**: Linux server (Render) + Neon PostgreSQL; blobs en filesystem del contenedor (dev) / S3-like (prod, deuda de adaptador).

**Project Type**: Web app hexagonal (backend + frontend).

**Performance Goals**: subida imagen ≤25 MiB (rechazo en streaming sin bufferizar entero) · firma interna TTL ≤300 s · latencia de purga ≤24 h tras umbral.

**Constraints**: `domain/` puro (no importa Express/Prisma/`node:crypto`-adapter; el cifrado y la firma son **puertos**) · PII cifrada en reposo · `object_ref`/firma interna/binario **nunca** en logs ni en respuestas de lectura/detalle · 404 uniforme (sin 403) · clave AES y TTLs validados al arrancar (Zod fail-fast).

**Scale/Scope**: organización única/plana; 2 endpoints nuevos + 1 ampliación de contrato; 1 vista front (abrir imagen sobre tiles de FE-9); tope ≤10 imágenes por ciclo.

## Constitution Check

*GATE: pasa antes de Phase 0 y se re-comprueba tras Phase 1. Sin excepciones para seguridad/bloqueantes.*

### Gate · Contract-First (Principio II)

- [x] Se creará en Phase 1 el **delta** de `contracts/orders.openapi.yaml` (OpenAPI 3.1) **antes** del código: nuevos `uploadOrderEvidence`, `getOrderEvidence`; `EvidenceMeta` amplía `items[]` (evolución compatible).
- [x] Tipos/validación (Zod) **derivados** del contrato; `snake_case` externo / `camelCase` interno (patrón `frontend/src/api/generated/` + `backend` Zod).
- [x] Cada `operationId` × código (`201/401/404/413/415/422` upload; `200/401/404/410` lectura; `200` detalle con items) tendrá contract test (100%).

### Gate · RBAC y seguridad (Principios IV, IX, XI)

- [x] Cada acción valida **rol + pertenencia + estado** en backend, **heredando `isOrderVisible`/`orderScopeFor`** (`domain/order/read-side/order-detail-visibility.ts`, `scope-policy.ts`) — sin regla nueva.
- [x] 401 vs 404 distinguidos; **404 uniforme (no 403)** por no-enumeración, idéntico a `getOrderDetail` (ver Complexity Tracking: es el patrón constitucional de no-enumeración, no una desviación). Test negativo por rol/estado.
- [x] PII: cifrado en reposo **AES-256-GCM** (verificable por bytes crudos ≠ plano, SC-004); firma interna **≤300 s** (puerto, no cloud); redacción en logs (FR-008); no hay envío a IA en esta feature (minimización N/A).
- [x] Auditoría append-only de lecturas autorizadas (FR-021); accesos denegados heredan la **señal best-effort** de `getOrderDetail` (patrón #009 existente).

### Gate · Arquitectura Hexagonal (Principio III)

- [x] Capas `domain/` (pura, + **nuevo `StoragePort`** en `domain/order/` o `domain/ports/`) · `handlers/orders/` · `infra/storage/` (adaptador fs+crypto). El dominio NO importa el adaptador.
- [x] Dependencias por inyección vía `infra/container.ts`; dominio testeable sin BD ni filesystem (fake del puerto).

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)

- [x] FRs en EARS (spec) · trazabilidad RF→endpoint→tarea→test (spec §Trazabilidad + tasks).
- [x] TDD con **commit de test en rojo** previo; cobertura dominio ≥80% y servicios ≥80% (thresholds `vitest.config.ts`).
- [x] SC medibles con tests **deterministas** (Postgres real + fake/real del `StoragePort`; grep de logs; expiración de firma; purga). **Eval promptfoo N/A** (sin componente IA). Gates G1 ✅ / G2 / G3 previstos (0 bloqueantes).

## Project Structure

### Documentation (this feature)

```text
specs/024-evidence-binary-signed-url/
├── plan.md              # Este fichero
├── research.md          # Phase 0 (decisiones de diseño)
├── data-model.md        # Phase 1 (entidades + estados)
├── quickstart.md        # Phase 1 (validación end-to-end)
├── contracts/           # Phase 1 (delta OpenAPI)
├── checklists/          # requirements.md + security.md
└── tasks.md             # Phase 2 (/speckit-tasks — NO lo crea plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── domain/
│   │   ├── order/
│   │   │   ├── evidence.ts                 # (existe) validación EvidenceRef; se amplía con reglas de ciclo/staging
│   │   │   ├── read-side/                  # (existe) order-detail-visibility.ts → hereda autz de lectura
│   │   │   └── write-side/                 # (existe) submit-execution.ts → referencia object_refs staged
│   │   └── ports/
│   │       └── storage.ts                  # NUEVO: StoragePort (put staged, sign≤300s, read, list, delete, encrypt)
│   ├── handlers/
│   │   └── orders/
│   │       ├── upload-evidence.ts          # NUEVO: uploadOrderEvidence (multipart, autz-primero)
│   │       ├── get-evidence.ts             # NUEVO: getOrderEvidence (200 sesión / 404 / 410)
│   │       ├── execution.ts                # (existe) submit sin cambio de cuerpo; usa refs staged
│   │       └── get-order-detail.ts         # (existe) añade items[] a evidence
│   └── infra/
│       ├── storage/
│       │   ├── fs-storage-adapter.ts       # NUEVO: filesystem + AES-256-GCM + firma HMAC con TTL
│       │   └── gc-job.ts / retention-job.ts# NUEVO: GC de staging/superados (FR-024) y purga 90d (FR-018)
│       ├── config.ts                       # (existe) + clave AES, TTL firma, TTL staging (Zod fail-fast)
│       └── container.ts                    # (existe) cablea StoragePort → adaptador
└── tests/{contract,integration,unit,arch}/ # Postgres real (db-test :5433) + fake del StoragePort

frontend/
└── src/
    ├── features/orders/
    │   ├── OrderDetailView.tsx             # (existe) tiles «Imagen N» → miniatura/enlace real (fetch→blob)
    │   ├── useOrders.ts / useOrderMutations.ts # (existe) + hook de lectura de evidencia (blob) y de subida
    │   └── EvidencePicker.tsx              # (existe) subida ahora va a uploadOrderEvidence multipart
    └── api/{generated,types.ts,schemas.ts} # regenerar del contrato (items[], nuevos endpoints)
```

**Structure Decision**: Web app hexagonal (Option 2). El grueso es backend: **un puerto de almacenamiento nuevo** con adaptador filesystem+crypto en `infra/storage/`, dos handlers nuevos y la ampliación de `getOrderDetail`. El dominio permanece puro (cifrado/firma/almacenamiento son puertos inyectados). El front reutiliza la vista de FE-9 y solo añade el consumo por blob same-origin.

## Complexity Tracking

| Decisión | Por qué necesaria | Alternativa más simple rechazada porque |
|----------|-------------------|------------------------------------------|
| **404 uniforme (sin 403)** en evidencia | No-enumeración de `orderId`/`evidenceId` (Constitución IX; patrón ya establecido en `getOrderDetail`) | Un 403 sobre un id concreto revelaría existencia (fuga de información) — no es desviación sino el patrón constitucional |
| **Puerto de almacenamiento nuevo** (no reutilizar `crypto/` existente) | El `crypto/` actual es solo hashing de password/token; el blob necesita cifrado simétrico AES-256-GCM + firma con TTL + persistencia | Guardar binario en Postgres (bytea) rompería el objetivo de firma≤300s/S3-like y cargaría la BD con PII binaria |
| **Staging sin fila** (metadatos de staging en `object_ref` HMAC-firmado + metadata del objeto) | Mantiene el invariante «blob staged = sin fila `OrderEvidence`» (FR-011/FR-022) sin tabla nueva | Una tabla `EvidenceStaging` añadiría estado mutable fuera del append-only y superficie de deriva (Principio XV) |
