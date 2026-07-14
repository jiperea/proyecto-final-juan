# Quickstart — verificar el pipeline CI/CD

> Escenarios ejecutables que prueban que el pipeline funciona end-to-end. Prerrequisitos de configuración
> manual (GitHub/Render/Neon) en `docs/16-devops-setup-manual.md`. Detalle de FRs en `docs/pipeline-spec.md`.

## 0. Verificación estática (local, sin red) — Capa 1

```bash
# SHA-pin: 0 acciones por tag (SC-007 / FR-016)
grep -rEn 'uses: .*@v[0-9]' .github/workflows/*.yml ; echo "esperado: sin salida"
# permisos mínimos: ningún write-all
grep -rn 'write-all' .github/workflows/*.yml ; echo "esperado: sin salida"
# higiene de secretos (FR-018b): ningún echo de secrets, ningún pull_request_target
grep -rEn 'echo[^|]*\$\{\{\s*secrets\.' .github/workflows ; grep -rn 'pull_request_target' .github/workflows
# guardián + trazabilidad deterministas (FR-007/008): exit 0
bash scripts/validate-constitution.sh ; echo "exit=$?"
bash scripts/acceptance-check.sh ; echo "exit=$?"
# spec-antes-que-YAML (SC-004 / AC-1): pipeline-spec.md anterior al primer workflow de validación
git log --diff-filter=A --format='%ct %h %s' -- docs/pipeline-spec.md | tail -1
```

## 1. PR-gate bloquea (US1 / SC-001, SC-002)

1. Rama `feature/x`, cambio SOLO en `backend/**` → PR a `develop`.
2. **Esperado:** corre `pr-validation-back.yml` (lint·test, Spectral, oasdiff, Gitleaks, acceptance,
   Trivy, guardián, code-review) y **NO** `pr-validation-front.yml` (SC-002).
3. Inyecta un fallo (test roto / secreto de prueba / OpenAPI inválido) → el check queda **rojo** y el merge
   se **bloquea** (SC-001). Quítalo → verde → mergeable.
4. Un cambio en `contracts/**` dispara **ambos** gates.

## 2. CI de develop → snapshot en GHCR + dist + deploy a dev (US2/US3 · SC-005, SC-008)

1. Merge a `develop` (con cambios en back).
2. **Esperado:** `ci-develop-back.yml` publica `ghcr.io/<owner>/<repo>/fieldops-backend:x.y.z-snapshot.{sha}`
   **y** `:develop`; sube el `dist` como artifact (90 d); dispara el deploy-hook de **dev** (SC-005/SC-008).
3. Verifica la imagen: pestaña *Packages* del repo. Verifica dev: `curl -s -o /dev/null -w '%{http_code}'
   <URL_dev>` → `200` (puede tardar por el cold start del free tier).

## 3. Release en main → semver + GitHub Release (US2 · SC-005) + deploy a pre (Fase 2 · AC-11)

1. Bump `backend/package.json` y `frontend/package.json` al mismo `X.Y.Z`; `git tag vX.Y.Z && git push --tags`.
2. **Esperado:** `ci-main-{back,front}.yml` verifican lockstep (ambos package.json == tag), publican
   `…:x.y.z` + `:latest`, crean el **GitHub Release** con los dos `dist` como assets; (Fase 2) `cd-pre`
   despliega **pre** con `:x.y.z` y registra el GitHub Deployment.

## 4. Deploy a prod = manual (US3 · SC-009)

1. Actions → `cd-prod.yml` → *Run workflow*: `componente=ambos`, `version=vX.Y.Z`, `confirmar=PROD`.
2. **Esperado:** valida que `version` == lo desplegado en `pre` y que la imagen existe → dispara el deploy-hook
   de **prod**. Sin `on: push` que toque prod (SC-009). Sin `confirmar=PROD`, aborta.

## Notas
- El escaneo de secretos universal (`secrets-scan.yml`) corre en **todo** PR y push a develop/main.
- El guardián-agente (FR-009) solo corre si existe `secrets.ANTHROPIC_API_KEY` (opt-in); si no, *skipped*.
