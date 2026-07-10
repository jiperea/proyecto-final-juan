# 05 · Automatización del flujo SDD (rama por spec + gates adversariales)

> Diseño de cómo automatizamos la disciplina SDD para **reducir ambigüedades y cazar errores** en cada
> punto. Requisito del usuario: cada spec en su rama; los gates de revisión adversarial se ejecutan
> **solo** tras `clarify`, tras `analyze` y tras `implement` + tests funcionales.

---

## 1. Una rama por spec

Spec Kit ya crea una rama por feature con `create-new-feature.sh` (`.specify/scripts/bash/`), que
genera `NNN-feature` y la estructura `specs/NNN-feature/`. Se refuerza como gobernanza:

- Cada feature nace con `/speckit-specify` (o la skill `speckit-git-feature`), que crea la rama.
- Commits separados: `spec → plan → tasks → código`, para que el historial demuestre spec-first.
- Merge a `main` solo tras pasar el gate post-implementación.

---

## 2. Los tres gates adversariales (y solo esos tres)

| Gate | Momento | Qué busca | Artefacto que revisa |
|---|---|---|---|
| **G1 · Spec** | tras `/speckit-clarify` | ambigüedades, requisitos no descritos correctamente, no-EARS | `spec.md` (+ clarifications) |
| **G2 · Consistencia** | tras `/speckit-analyze` | errores de planteamiento, incoherencias spec↔plan↔tasks, trazabilidad | `spec.md`, `plan.md`, `tasks.md` |
| **G3 · Implementación** | tras `/speckit-implement` + tests funcionales en verde | errores de implementación vs spec, huecos de seguridad reales | diff + spec + tests |

**Por qué solo estos tres** (decisión del usuario): concentrar el escrutinio donde más valor aporta y
evitar fatiga de gates. `specify`, `plan` y `tasks` no llevan gate propio; su calidad se arrastra al
gate siguiente.

**Criterio de paso (aprendizaje Módulo 8):** el gate pasa con **0 hallazgos BLOQUEANTES** (no exigimos
0 hallazgos). Un BLOQUEANTE abierto detiene el avance.

---

## 3. Mecanismo: extensión Spec Kit `adversarial-gate`

Spec Kit ejecuta hooks declarados en `.specify/extensions.yml` por evento (`after_<comando>`), con
`auto_execute_hooks: true`. Creamos una extensión propia:

```
.specify/extensions/adversarial-gate/
  extension.yml                      # declara el comando y los hooks after_clarify/after_analyze/after_implement
  commands/
    speckit.adversarial-gate.run.md  # el comando: corre el panel y consolida
```

Y la registramos en `.specify/extensions.yml`:

```yaml
hooks:
  after_clarify:
    - extension: adversarial-gate
      command: speckit.adversarial-gate.run
      enabled: true
  after_analyze:
    - extension: adversarial-gate
      command: speckit.adversarial-gate.run
      enabled: true
  after_implement:
    - extension: adversarial-gate
      command: speckit.adversarial-gate.run
      enabled: true
```

El comando `speckit.adversarial-gate.run` (fichero `.md`) instruye a Claude para:
1. Detectar la fase (clarify/analyze/implement) y los artefactos a revisar.
2. Lanzar el **panel de 3 subagentes** (`revisor-cinico`, `auditor-spec-theater`,
   `revisor-rbac-seguridad`) en paralelo sobre esos artefactos.
3. Consolidar (dedupe + severidad + veredicto más restrictivo).
4. Escribir el informe en `docs/gates/gate-G{n}-{spec}.json` y su resumen `.md`.
5. Si hay ≥1 BLOQUEANTE → reportarlo y **detener** el avance; si 0 → luz verde.

---

## 4. Variante headless / CI: `scripts/adversarial-gate.sh`

Para ejecución no interactiva (CI, o correr el gate a mano), un script portable al estilo Módulo 8:

- Recibe `--phase {G1|G2|G3}` y `--target <ruta>`.
- Por cada agente: `claude -p "$(cat .claude/agents/<agente>.md) \n\n<artefacto>" --output-format json | jq -r '.result'` (extracción del wrapper + parseo del JSON del review).
- Cuenta `huecos[] | select(.severidad=="BLOQUEANTE") | length`.
- **Exit code 0** si 0 bloqueantes; **exit 1** si hay bloqueantes → apto como gate de branch protection.
- Vuelca el informe a `docs/gates/`.

> El `.md` sirve al flujo interactivo (auto-hook de Spec Kit); el `.sh` sirve a CI y a reproducibilidad.
> Mismo criterio (0 bloqueantes), misma salida.

---

## 5. Configuración de Claude Code

- **`.claude/settings.json`** (a crear): allowlist del comando del gate y de `jq`/`claude -p` para
  reducir prompts de permiso en la ejecución automática; opción `env` si hiciera falta.
- Los subagentes ya viven en `.claude/agents/` (revisor-cinico, auditor-spec-theater,
  revisor-rbac-seguridad) y son la pieza reutilizable del panel.

---

## 6. Flujo completo resultante

```
/speckit-constitution
        │
   (rama NNN-feature)
        │
/speckit-specify ──► /speckit-clarify ──► [G1: panel adversarial] ──► /speckit-checklist
        │                                        (0 bloqueantes)
        ▼
/speckit-plan ──► /speckit-tasks ──► /speckit-analyze ──► [G2: panel adversarial]
        │                                                        (0 bloqueantes)
        ▼
/speckit-implement + tests funcionales ──► [G3: panel adversarial] ──► merge a main
                                                  (0 bloqueantes)
```

Cada gate deja rastro en `docs/gates/`, alimentando la bitácora (ver `README.md`).
