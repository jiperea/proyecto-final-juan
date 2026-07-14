# FieldOps backend — imagen multi-stage (Node 20 slim; argon2 nativo → glibc con prebuilds).
# Etapa build: instala TODAS las deps, genera cliente Prisma, compila TS → dist.
FROM node:20-slim AS build
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
# El package.json raíz es "type":"module"; el build emite CommonJS → marca dist como CJS.
RUN echo '{"type":"commonjs"}' > dist/package.json

# Etapa runtime: solo deps de PRODUCCIÓN (incluye prisma para `migrate deploy`; excluye
# tsc/vitest/promptfoo). Cliente Prisma regenerado. Usuario no-root.
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Prisma necesita openssl en debian-slim (detección de libssl para el engine).
# `apt-get upgrade` parchea los paquetes del SO del base image con CRITICAL/HIGH corregibles
# (p.ej. libgnutls30, libcap2) → Trivy en verde SIN esconder (011 FR-003, conformidad FR-P05).
RUN apt-get update && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
# El usuario no-root debe poder escribir (engines de Prisma en migrate deploy).
RUN chown -R node:node /app
USER node
EXPOSE 3000
# Aplica migraciones (idempotente) y arranca. La imagen NO se reconstruye en despliegue (XVI §4).
# Runtime sin npm/npx (FR-003a de 011): prisma se invoca por node directo, así el npm del base
# image NO es superficie de ejecución (justifica el skip de Trivy en FR-003b).
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
