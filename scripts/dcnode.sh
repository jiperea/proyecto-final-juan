#!/usr/bin/env bash
# Ejecuta comandos Node/npm/vitest dentro de un contenedor node:20 (no hay Node en el host),
# montando backend/ y uniéndose a la red de docker-compose para alcanzar Postgres (db-test).
# Uso: bash scripts/dcnode.sh <cmd...>   p.ej.  bash scripts/dcnode.sh npx vitest run tests/unit
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm \
  -v "$PWD/backend":/app -w /app \
  --network proyecto-final_default \
  -e DATABASE_URL="postgresql://fieldops:fieldops@db-test:5432/fieldops_test" \
  -e NODE_ENV="test" \
  node:20 "$@"
