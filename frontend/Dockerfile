# FieldOps frontend — multi-stage: build estático con Vite → servido por nginx.
# Usa los tipos ya generados en src/api/generated (versionados); no necesita ../contracts en build.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime: nginx NO-ROOT (imagen unprivileged; escucha en 8080 sin privilegios) sirve el estático
# y proxya /v1 → backend (mismo origen para el navegador).
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# Parcheo del SO del base image (Trivy/FR-P05, feature 012): apk upgrade sube los
# paquetes de Alpine a sus versiones corregidas (openssl/libcrypto3, libpng, libexpat,
# c-ares…). Requiere root; se RESTAURA el usuario no-root (uid 101 del base image)
# antes de servir → no se degrada la postura no-root del contenedor (FR-001b, SC-005).
USER root
RUN apk --no-cache upgrade
USER 101
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
