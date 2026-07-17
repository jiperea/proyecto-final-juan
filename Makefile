# FieldOps 001 — un comando para todo (Constitution §Convenciones)
# Entorno SIN Node en el host: todo corre en contenedor node:20 (scripts/dcnode.sh) + Postgres (compose).
.PHONY: install up down dev build test test-unit lint typecheck migrate seed reset gate

install:
	bash scripts/dcnode.sh npm install

# 026/FR-006 — up levanta db+db-test y migra/siembra (con blob de evidencia real) EN EL CONTEXTO DEL
# CONTENEDOR `backend` (docker compose run --rm backend, override de dev fusionado ⇒ DATABASE_URL=db/
# fieldops, EVIDENCE_STORAGE_DIR del volumen navegado, EVIDENCE_ENC_KEY heredada de env_file) — NO el
# contenedor node efímero de scripts/dcnode.sh (que apunta a db-test/fieldops_test).
up: ; docker compose up -d db db-test && docker compose run --rm backend sh -c "npx prisma generate && npx prisma migrate deploy && npm run seed"

down:
	docker compose down

# MODO DEV: stack completo con código en vivo + HMR (usa docker-compose.override.yml).
# Requiere la db ya migrada/seedeada una vez (`make up`). Front en :5173, back en :3001.
dev:
	docker compose up -d
	@echo "→ Front (HMR): http://localhost:5173  ·  API /v1 proxya al backend"

# PARIDAD PROD: construye las imágenes back/front (Vite build + nginx), sin el override de dev.
build:
	docker compose -f docker-compose.yml build

migrate:
	bash scripts/dcnode.sh npx prisma migrate deploy

# 026/FR-006 — seed puebla la BD/almacén NAVEGADOS (db/fieldops, EVIDENCE_STORAGE_DIR) en el contexto
# del contenedor `backend` (hereda env_file/DATABASE_URL/volumen/UID por construcción). NO usa
# scripts/dcnode.sh (que apuntaría a db-test/fieldops_test, la BD de la suite de tests). La clave
# EVIDENCE_ENC_KEY nunca se pasa por argv: se hereda vía env_file del servicio backend.
seed: ; docker compose run --rm backend npm run seed

# 026/FR-011 — reset: guard dev-local -> prisma migrate reset --skip-seed -> vacía EVIDENCE_STORAGE_DIR
# (mkdir -p, idempotente) -> re-siembra (con blob), todo en UNA sola invocación del contenedor `backend`
# (backend/scripts/reset.ts). Si el guard falla, `prisma migrate reset` nunca se invoca.
reset: ; docker compose run --rm backend npx tsx scripts/reset.ts # guard dev-local -> prisma migrate reset --force --skip-seed -> vaciar EVIDENCE_STORAGE_DIR -> re-sembrar

# unit (sin BD) + integration + contract (Postgres real, db-test)
test:
	bash scripts/dcnode.sh npx vitest run --no-file-parallelism

test-unit:
	bash scripts/dcnode.sh npx vitest run tests/unit

lint:
	bash scripts/dcnode.sh npx eslint .

typecheck:
	bash scripts/dcnode.sh npx tsc -p tsconfig.json --noEmit

# Gate adversarial headless (Constitution XIII); exit 0/1 según bloqueantes
gate:
	bash scripts/gate.sh --phase $(PHASE) --feature-dir specs/001-fundacion-auth-rbac
