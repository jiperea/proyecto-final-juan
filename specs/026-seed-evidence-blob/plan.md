# Implementation Plan: Seed de desarrollo con blob de evidencia real

**Branch**: `026-seed-evidence-blob` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-seed-evidence-blob/spec.md`

## Summary

Habilitador de **desarrollo (backend + tooling)** que hace visible la evidencia sembrada en el visor (025). El seed escribe un **blob de imagen real** vía el mismo `StoragePort`/adaptador cifrado de 024 (`putStaged`), de modo que `getOrderEvidence` sirva **200** (no 410) para la evidencia de la orden ancla (marcada como **ciclo vigente** —audit `reason:'execution_registered'`, FR-014— para que el GC de staging no la purgue); y la tooling (`make up`/`make seed`/`make reset`) se re-apunta a la **BD y almacén navegados en dev** (`db`/`fieldops`, `EVIDENCE_STORAGE_DIR`) ejecutando el seed **en el contexto del contenedor `backend`**. **No cambia contrato/dominio/RBAC/prod**; corrige el bug preexistente de `make seed` (poblaba `fieldops_test`).

## Technical Context

**Language/Version**: TypeScript 5 strict · Node 18+ · Prisma · Docker Compose.

**Primary Dependencies (reutilizadas, sin modificar su código de negocio)**:
- `StoragePort.putStaged(input): ObjectRef` y el `FsStorageAdapter` (`backend/src/infra/storage/fs-storage-adapter.ts`) — cifrado AES-256-GCM, content-addressed. El seed **construye el adaptador igual que `container.ts:75`** (`new FsStorageAdapter({ baseDir, encKey, clock })`) con `baseDir`/`encKey` leídos del entorno.
- Validación de `EVIDENCE_ENC_KEY` (`z.string().min(32)` en `backend/src/infra/config.ts`) — se **extrae a un validador compartido** reutilizado por config y seed (FR-013), sin cargar `loadConfig()` completo.
- `ensureSeedableOrThrow`/`RESEED_HINT` (`backend/prisma/seed.ts`) — **sin cambiar su comportamiento** (solo se actualiza el **texto** del hint para apuntar a `make reset`; el test 019 usa la constante).

**Storage**: fs+crypto existente (dev). El blob se sirve por `getOrderEvidence` sin cambios en el handler.

**Testing**: Vitest (unit del script de seed con `child_process`/StoragePort mockeables; `putStaged` real contra tmpdir para el ida-y-vuelta descifrable) + verificación de flujo en `quickstart.md`. La suite usa su **BD de test independiente** (no afectada).

**Project Type**: Web app hexagonal — esta feature toca **`backend/prisma/seed.ts`**, **`backend/src/infra/` (validador compartido)**, y **tooling** (`scripts/dcnode.sh`/`Makefile`/`docker-compose`).

**Constraints**: guard dev-local (NODE_ENV≠production + hostname exacto de DATABASE_URL); clave heredada vía `env_file` (sin argv/logs); todo `make reset`/`seed` en el contexto del contenedor backend; object_ref = **el que devuelve `putStaged`** (no determinista — verificado en G2; no se toca el adaptador); **audit `reason:'execution_registered'`** para que el GC de staging no purgue el blob (FR-014); seed atómico (blob antes que fila, tx); modelo reset-y-siembra (sin ruta incremental; no-acumulación por `make reset`).

**Scale/Scope**: 1 imagen mínima embebida (≤2048 B) en 1 orden ancla; **13 FR** (FR-001..FR-014, FR-012 retirado), 5 SC.

## Constitution Check

*GATE: feature de datos/tooling de dev; no añade endpoints ni lógica de dominio ni RBAC.*

### Gate · Contract-First (Principio II)
- [x] **N/A**: sin endpoints ni cambios de contrato (FR-008). Reutiliza `getOrderEvidence`/`uploadOrderEvidence`/`StoragePort` de 024 sin tocar su código.

### Gate · RBAC y seguridad (Principios IV, IX, XI)
- [x] Sin RBAC nueva. **Seguridad reforzada** en el seed: guard dev-local positivo (no sembrar pre/prod), clave del entorno validada sin hardcode ni fuga (env_file, no argv/logs), guard antes de cualquier operación destructiva.
- [x] La imagen sembrada son bytes mínimos embebidos (no PII). El blob se cifra con la misma clave que el backend (heredada de env_file).

### Gate · Arquitectura Hexagonal (Principio III)
- [x] El seed reutiliza el **puerto** `StoragePort` (no reimplementa cifrado). El validador de clave compartido vive en `infra`, no en dominio.

### Gate · Calidad y verificación (Principios V, VI, VII, XIII, XIV)
- [x] FRs en EARS; trazabilidad en la spec y `docs/traceability.md`.
- [x] **TDD fase Red**: tests del seed (guard aborta/exit≠0, blob descifrable 200, idempotencia, object_ref determinista) en rojo antes de implementar.
- [x] SC medibles (exit codes, 200 vs 410, arch-diff). Gates G1 (✅ PASS) / G2 / G3 previstos.

> **Sin violaciones**: toca backend infra/seed + tooling, no dominio/endpoints/RBAC. No se rellena Complexity Tracking.

## Project Structure

```text
backend/
├── prisma/seed.ts               # MODIF — guard dev-local; escribe blob vía StoragePort (putStaged) ANTES de la fila; object_ref = ref DEVUELTO (no determinista, verificado); OrderAudit ancla reason:'execution_registered' (FR-014, para que el GC no lo purgue); RESEED_HINT→make reset
├── src/infra/
│   ├── config.ts                # MODIF menor — extraer validador de EVIDENCE_ENC_KEY a helper compartido (FR-013)
│   └── storage/fs-storage-adapter.ts  # SIN CAMBIOS (reutilizado)
scripts/dcnode.sh                # (revisar) ruta de seed → contexto backend/db-fieldops, no db-test
Makefile                         # MODIF — up/seed/reset en contexto `docker compose run --rm backend`; nuevo target `reset`
docker-compose.yml / .override.yml   # (revisar) backend service ya expone env_file + volumen EVIDENCE_STORAGE_DIR
backend/tests/                   # NUEVO — seed-evidence-blob.spec.ts (guard, blob 200 descifrable, idempotencia, object_ref determinista, arch: 0 cambios contrato/dominio/RBAC)
```

**Structure Decision**: El cambio de código vive en `backend/prisma/seed.ts` (+ un helper compartido de validación de clave en `infra`). La tooling (`Makefile`/`dcnode.sh`) se re-apunta para ejecutar el seed **en el contenedor `backend`** (heredando env_file/DATABASE_URL/volumen). `make reset` es un target nuevo que orquesta guard→`prisma migrate reset --skip-seed`→vaciar `EVIDENCE_STORAGE_DIR`→re-sembrar, todo en esa invocación. CI (`npm run seed`) no se toca.

## Complexity Tracking

> Sin violaciones de la Constitution que justificar. Tabla vacía.
