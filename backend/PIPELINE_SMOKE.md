# Pipeline smoke-test

Fichero inocuo bajo `backend/` para **disparar el PR-gate de backend** (`pr-validation-back.yml`)
en una PR de prueba contra `develop` (reto M12 §10). No afecta a la app.

- Toca `backend/**` → corre el workflow de back y **NO** el de front (filtro `paths:`, FR-P01).
- Sirve para ver en Actions: guardián + lint·typecheck·test + Spectral/oasdiff + gitleaks + Trivy + code-review.
- Se puede borrar tras la demostración (cerrar la PR y eliminar la rama `test/pipeline-smoke`).
