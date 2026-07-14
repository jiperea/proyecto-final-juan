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
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
