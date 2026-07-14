# Research — Pipeline CI/CD (Phase 0)

> Decisiones técnicas del pipeline. Formato: Decisión · Racional · Alternativas descartadas. No quedan
> `[NEEDS CLARIFICATION]` (resueltos en `/speckit-clarify`, ver spec §Clarifications).

## D1 · Orquestador = GitHub Actions
- **Decisión:** GitHub Actions (requisito duro del usuario y del reto M12).
- **Racional:** integrado con el repo, GHCR con `GITHUB_TOKEN` sin secretos extra, gratis para el uso.
- **Alternativas:** GitLab CI / CircleCI — descartadas (repo en GitHub, fricción innecesaria).

## D2 · Registro de imágenes = GHCR
- **Decisión:** `ghcr.io/<owner>/<repo>/fieldops-<componente>:<version>`, auth con `GITHUB_TOKEN`, packages
  **privados** (pull de Render con PAT read-only).
- **Racional:** lo pide el reto §4; sin secretos adicionales para push.
- **Alternativas:** Docker Hub (rate limits, otra credencial), registro de Render (acopla al proveedor).

## D3 · Target de CD = Render + Neon (gratis, URL pública)
- **Decisión:** **Render** (web free, despliega imagen de GHCR vía deploy-hook, no-rebuild) + **Neon**
  (Postgres free, una BD/branch por entorno).
- **Racional:** GHA orquesta (deploy-hook), gratis sin tarjeta, URL pública para demo; el cloud es libre (reto §8).
- **Alternativas:** Fly.io (ya no free), Railway (no free), Cloud Run/AWS (tarjeta + espejar GHCR→su registro,
  más fricción). Ver memoria `cd-target-render-neon`.

## D4 · No-rebuild = build único + `docker save/load` entre jobs
- **Decisión:** cada workflow de CI construye la imagen **una vez**, la escanea (Trivy) y la pasa por artifact
  (`docker save|gzip` → `download` + `docker load`) al job de push; el CD **no** reconstruye.
- **Racional:** garantiza "lo que se despliega == lo escaneado" dentro del workflow (SC-006, FR-014).
- **Alternativas:** rebuild en cada job (viola no-rebuild); registrar por digest y re-pull (más complejo, se
  valora como endurecimiento — ver riesgo TOCTOU del tag móvil abajo).

## D5 · Versionado = tag semver `vX.Y.Z` (trigger de main) + lockstep
- **Decisión:** el CI de `main` se dispara por **push de tag `vX.Y.Z`**; la versión sale del tag y se verifica
  `== package.json` (normalizado `${GITHUB_REF_NAME#v}`); **lockstep**: un tag releasea ambos componentes al
  mismo `x.y.z`, con **guarda cruzada** (cada workflow verifica AMBOS `package.json`) para evitar release parcial.
- **Racional:** reto §4 (tag antes del merge define la versión); lockstep simplifica el deploy multi-servicio.
- **Alternativas:** trigger en push a `main` (requiere resolver el tag del commit, más frágil); versionado
  independiente por componente con tags `backend-v*`/`frontend-v*` (más flexible, innecesario para un monorepo demo).

## D6 · Tags móviles por entorno (`:develop`, `:latest`)
- **Decisión:** además del inmutable, publicar un tag móvil que Render rastrea; el deploy-hook redeploya ese tag.
- **Racional:** el deploy-hook de Render redeploya el tag configurado; un tag móvil evita reconfigurar el
  servicio en cada release.
- **Riesgo asumido:** TOCTOU (merge concurrente sobrescribe el tag) → mitigado con `concurrency` en el workflow;
  endurecimiento futuro = fijar por **digest**. `pre` consume el **semver inmutable** (no `:latest`) por seguridad.

## D7 · Guardián de Constitución = determinista (always-on) + agente (opt-in)
- **Decisión:** `validate-constitution.sh` determinista siempre (0 coste, FR-008); guardián-agente vía API
  (`claude -p`, patrón M9) **opt-in y desactivado** (job gated a `secrets.ANTHROPIC_API_KEY`, FR-009/FR-P21).
- **Racional:** el reto pide "Claude Code Action"; el proyecto prohíbe API de pago (CLAUDE.md #4, NFR-P03) →
  el determinista cumple el objetivo gratis y el agente queda preparado para activarse a conciencia.
- **Alternativas:** solo agente (rompe "sin API de pago"); solo determinista (no cubre la letra del reto).
  Excepción única a NFR-P03 documentada.

## D8 · Gates M9 — herramientas
- **Decisión:** gitleaks (CLI OSS, versión+checksum fijados), Spectral (`@stoplight/spectral-cli`), oasdiff
  (binario+checksum), Trivy (`aquasecurity/trivy-action@<sha>`, `--severity CRITICAL,HIGH --ignore-unfixed`),
  `acceptance-check.sh` (trazabilidad), `code-review-gate` (job dummy certificador, reto §4).
- **Racional:** son los gates que pide el reto §4 (heredados de M9), deterministas y sin API.
- **Alternativas:** gitleaks-action (requiere licencia en org) — se usa el CLI OSS.
