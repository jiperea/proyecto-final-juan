import { buildApp } from './handlers/app';
import { loadConfig } from './infra/config';
import { buildContainer } from './infra/container';
import { createLogger } from './infra/logger';
import { scheduleEvidenceJobs } from './infra/storage/schedule-jobs';

const logger = createLogger();
const config = loadConfig(); // fail-fast: aborta si falta/está mal una variable (FR-016)
const { deps, prisma, storage } = buildContainer(config);
const app = buildApp(deps);

// 024 (US3, T044): jobs de purga de evidencia (GC de staging/superados FR-024 + retención 90d FR-018),
// disparo programado ≥ a diario (latencia máxima de purga ≤24h). Ver infra/storage/schedule-jobs.ts.
scheduleEvidenceJobs({
  storage,
  prisma,
  stagingTtlMs: config.evidenceStagingTtlHours * 3_600_000,
  logger,
});

app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'FieldOps auth service arriba');
});
