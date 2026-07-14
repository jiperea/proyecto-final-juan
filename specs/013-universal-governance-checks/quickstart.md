# Quickstart — validación de 013 (PR Gate agregador)

Feature de pipeline: se valida por **validación estática** local + **ejecución real** en Actions. Sin IA.

## 1. Estática (local, determinista)
```bash
# YAML válido
ruby -ryaml -e "YAML.load_file('.github/workflows/pr-gate.yml')"
# SHA-pin (AC-6): 0 acciones por tag
grep -nE "uses:.*@v[0-9]" .github/workflows/pr-gate.yml || echo "OK: todas por SHA"
# needs del agregador cubre todos los jobs (SC-006) — lo hace el job gate-selfcheck en CI;
# comprobación rápida local: comparar la lista de jobs con el needs de 'PR Gate'.
# Guardián determinista sigue en 0
bash scripts/validate-constitution.sh && echo "guardian OK"
bash scripts/acceptance-check.sh && echo "acceptance OK"
```

## 2. Real (Actions) — SC-001..006, tras la migración "Settings primero" (FR-007)
- **SC-001 (no deadlock):** PR que solo toca `docs/**` → `PR Gate` + `gitleaks` verdes, PR `MERGEABLE`
  (jobs de componente **skipped**, no "Expected").
- **SC-002 (calidad):** PR de `backend/**` con un fallo inyectado (test roto o Trivy CRITICAL/HIGH) → `PR
  Gate` **falla**, merge bloqueado. Ídem front.
- **SC-003:** PR de back → gobernanza + 3 jobs back corren, 2 de front **skipped**; PR de front, al revés.
- **SC-004:** required = `{PR Gate, gitleaks}`; gobernanza una sola vez; sin huérfanos.

## 3. Migración "Settings primero" (la hace el usuario — FR-007)
1. Settings → required = **`{gitleaks (todo el repo)}`** (retirar los 8 paths-dependientes + huérfano `Lint (pull_request)`).
2. Mergear el PR de 013 (añade `pr-gate.yml`, borra `pr-validation-*.yml`).
3. Settings → required = **`{PR Gate, gitleaks}`**.
> Rollback: si `PR Gate` no se reconoce, volver a `{gitleaks}` y/o revertir el commit.
