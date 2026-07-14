# 16 · Manual de configuración del pipeline CI/CD (lo que se hace a mano)

> El código del pipeline (workflows, scripts, Dockerfiles) está en el repo. **Esto es lo que TÚ tienes que
> configurar a mano** en GitHub / Render / Neon para que funcione end-to-end. Referencias: spec
> `specs/010-devops-pipeline/`, detalle `docs/pipeline-spec.md`, checks requeridos `.github/branch-protection.md`.
> Orden recomendado: **A → B → C → D → E**. Enfoque **Fase 1 (dev) primero**; Fase 2 (pre/prod) después.

---

## A. GitHub — permisos del repo para el CI

1. **Settings → Actions → General → Workflow permissions**: deja *Read repository contents and packages*
   (los workflows elevan a `packages: write`/`contents: write` por job; no marques write global).
2. **Settings → Actions → General**: *Allow GitHub Actions to create and approve pull requests* si vas a
   automatizar algo con PRs (no imprescindible).
3. Nada de secretos de GHCR: el push de imágenes usa el `GITHUB_TOKEN` automático.

## B. Neon (Postgres gestionada, gratis) — una BD por entorno

1. Crea un proyecto en <https://neon.tech> (free tier).
2. Crea **una branch/BD por entorno**: `dev`, `pre`, `prod` (Neon → *Branches*). Aislamiento por entorno.
3. De cada una copia su **connection string** (`postgresql://…?sslmode=require`). Las usarás en Render (paso C),
   como variable `DATABASE_URL` del servicio **backend** de ese entorno. **No** van al repo ni a GitHub Secrets.

## C. Render (cómputo, gratis, URL pública) — servicios por imagen de GHCR

> Empieza SOLO por **dev** (Fase 1). Repite para **pre** y **prod** en Fase 2.

Por cada entorno (`dev`, luego `pre`, `prod`) crea **dos** servicios web *from an existing image*:

### C.1 · Credencial para tirar de GHCR (packages privados)
- Crea un **PAT clásico** con scope `read:packages` (o un token fine-grained con acceso a packages).
- En Render → *Account/Workspace → Registry Credentials* → añade GHCR (`ghcr.io`, usuario = tu login,
  password = el PAT). Lo usarán los servicios para el `pull`.

### C.2 · Servicio backend (por entorno)
- **New → Web Service → Deploy an existing image**.
- Image URL (cada entorno rastrea su **tag móvil**; la CD lo mueve al semver exacto antes de desplegar):
  - dev: `ghcr.io/sdd-talent-devops/proyecto-final-juan/fieldops-backend:develop`
  - pre: `…/fieldops-backend:pre` · prod: `…/fieldops-backend:prod`
  *(No configures un `:x.y.z` fijo en pre/prod: el deploy-hook no cambia el tag, y `cd-pre`/`cd-prod` mueven
  `:pre`/`:prod` al semver validado sin reconstruir — así el hook sirve siempre la versión correcta.)*
- **Environment variables** (panel de Render — el backend valida al arrancar, fail-fast):
  `DATABASE_URL` (de Neon, C/B), `JWT_SECRET`, `CSRF_HMAC_SECRET`, `LOCKOUT_HMAC_SECRET` (3 distintos, ≥32
  chars), `NODE_ENV=production`, `PORT=3000`, `ACCESS_TTL=900`, `REFRESH_TTL_DAYS=7`, `GRACE_MS=10000`,
  `LOCKOUT_MAX=5`, `LOCKOUT_WINDOW_MIN=15`, `SESSION_STATE_TTL_MS=30000`, `DB_QUERY_TIMEOUT_MS=2000`,
  **`AI_PROVIDER=mock`** (⚠ en Render NO hay Claude CLI; si lo dejas en `claude-cli` el endpoint IA fallará).
  Las migraciones (`prisma migrate deploy`) corren solas al arrancar el contenedor (FR-P20).
- Copia el **Deploy Hook** del servicio (Settings → Deploy Hook): lo pondrás en GitHub (paso D).

### C.3 · Servicio frontend (por entorno)
- Igual, imagen `…/fieldops-frontend:develop` (dev) / `:pre` / `:prod` según entorno (tag móvil).
- ⚠ **Caveat conocido:** el `nginx.conf` del front proxya `/v1` a `backend:3000` (nombre de docker-compose),
  que **en Render no resuelve**. Para que el front llegue al backend en Render, apunta el proxy a la **URL
  del backend del entorno** (endurecimiento pendiente: parametrizar `nginx.conf` con `envsubst` y una var
  `BACKEND_URL`). Mientras tanto, la URL del front sirve la SPA; las llamadas `/v1` requieren ese ajuste.
- Copia su **Deploy Hook**.

## D. GitHub — Environments y secrets (por entorno)

**Settings → Environments** → crea `dev`, `pre`, `prod`. En cada uno, **Environment secrets**:

| Secret | Valor |
|---|---|
| `RENDER_DEPLOY_HOOK_BACKEND` | Deploy Hook del servicio backend de ESE entorno (C.2) |
| `RENDER_DEPLOY_HOOK_FRONTEND` | Deploy Hook del servicio frontend de ESE entorno (C.3) |
| `RENDER_DEV_HEALTHCHECK_URL` | *(solo `dev`, opcional)* URL de salud del backend dev → activa el smoke-test de `ci-develop-*` (SC-008) |
| `RENDER_PRE_HEALTHCHECK_URL` | *(solo `pre`, opcional)* ídem para AC-11 |

- **`prod` → Deployment protection**: en el Environment `prod`, *Deployment branches* → **Only `main`**
  (`deployment_branch_policy`). Verificable: `gh api repos/sdd-talent-devops/proyecto-final-juan/environments/prod`.
- *(Opcional, guardián-agente)* Secret **de repo** (Settings → Secrets → Actions) `ANTHROPIC_API_KEY`:
  **solo si** quieres activar el guardián-agente (FR-009). Sin él, ese job se **omite** (skipped) y el CI
  sigue gratis. ⚠ Con él, cada PR gasta API de pago.

## E. GitHub — Branch protection y tag ruleset

**Settings → Rules → Rulesets** (o Branches). Detalle en `.github/branch-protection.md`.

- **`main` y `develop`**: *Require a pull request* + *Require status checks to pass* con estos checks
  requeridos (nombres exactos de job): `gitleaks (todo el repo)`, `Guardián de Constitución + trazabilidad`,
  `Code review registrado`, `lint · typecheck · test (Postgres)` (back) / `lint · typecheck · test · build`
  (front), `Contratos (Spectral + oasdiff)`, `Imagen backend + Trivy` / `Imagen frontend + Trivy`. *No
  bypass* (ni admins). *(El check `Guardián de Constitución (agente · opt-in)` solo márcalo requerido si
  activaste `ANTHROPIC_API_KEY`.)*
- **Tag ruleset `v*`**: restringe quién crea/empuja tags `v*` (release solo desde `main`; la guarda
  `merge-base` en los workflows ya lo refuerza en código).

---

## Cómo ver que funciona (resumen; detalle en `specs/010-devops-pipeline/quickstart.md`)

1. **PR** `feature/x` → `develop` → todos los checks del componente en verde; si rompes algo, no mergeable.
2. **Merge a `develop`** → `Packages` del repo muestra `…/fieldops-<comp>:x.y.z-snapshot.{sha}` y `:develop`;
   la **URL dev de Render** sirve la nueva versión (caliéntala: el free tier duerme).
3. **Release**: bump AMBOS `package.json` al mismo `X.Y.Z`, `git tag vX.Y.Z && git push --tags` →
   imágenes `:x.y.z`+`:latest`, **GitHub Release** con los dos `dist`, y (Fase 2) **pre** desplegado.
4. **Prod** (Fase 2): Actions → `CD prod (manual)` → *Run workflow* con `version=vX.Y.Z`, `confirmar=PROD`
   → valida que `vX.Y.Z` == lo que hay en `pre` y despliega.

## Checklist rápido

- [ ] A. Workflow permissions read por defecto
- [ ] B. Neon: 3 branches (dev/pre/prod) + connection strings
- [ ] C. Render: 2 servicios × entorno desde GHCR + Registry Credential (PAT read:packages) + env vars backend (incl. `AI_PROVIDER=mock`)
- [ ] D. Environments dev/pre/prod con `RENDER_DEPLOY_HOOK_*`; prod restringido a `main`; (opcional) `ANTHROPIC_API_KEY`
- [ ] E. Branch protection main/develop (checks requeridos) + tag ruleset `v*`
- [ ] Ajuste pendiente: proxy `/v1` del front → URL del backend del entorno (nginx `envsubst`)
