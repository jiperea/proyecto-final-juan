import { buildApp } from './handlers/app';
import { loadConfig } from './infra/config';
import { buildContainer } from './infra/container';
import { createLogger } from './infra/logger';

const logger = createLogger();
const config = loadConfig(); // fail-fast: aborta si falta/está mal una variable (FR-016)
const { deps } = buildContainer(config);
const app = buildApp(deps);

app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'FieldOps auth service arriba');
});
