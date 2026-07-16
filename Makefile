# FieldOps 001 — un comando para todo (Constitution §Convenciones)
# Entorno SIN Node en el host: todo corre en contenedor node:20 (scripts/dcnode.sh) + Postgres (compose).
.PHONY: install up down dev build test test-unit lint typecheck migrate seed gate

install:
	bash scripts/dcnode.sh npm install

up:
	docker compose up -d db db-test
	bash scripts/dcnode.sh sh -c "npx prisma generate && npx prisma migrate deploy && npx tsx prisma/seed.ts"

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

seed:
	bash scripts/dcnode.sh npx tsx prisma/seed.ts

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
