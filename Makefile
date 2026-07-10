# FieldOps 001 — un comando para todo (Constitution §Convenciones)
.PHONY: install up down test test-unit gate seed migrate

install:
	cd backend && npm install

up:
	docker compose up -d db db-test
	cd backend && npm run prisma:generate && npm run prisma:migrate && npm run seed

down:
	docker compose down

migrate:
	cd backend && npm run prisma:migrate

seed:
	cd backend && npm run seed

# unit (sin BD) + integration + contract (BD real docker)
test:
	cd backend && npm run test

test-unit:
	cd backend && npm run test:unit

# Gate adversarial headless (Constitution XIII); exit 0/1 según bloqueantes
gate:
	bash scripts/gate.sh --phase $(PHASE) --feature-dir specs/001-fundacion-auth-rbac
