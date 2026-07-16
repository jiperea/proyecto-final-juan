import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { StoragePort } from '../../domain/ports/storage';
import { runStagingGc } from './gc-job';
import { runRetentionPurge } from './retention-job';

// Feature 024 (US3, T044) — disparo PROGRAMADO de los dos jobs de purga (FR-018/FR-024): "al menos a
// diario" para que la latencia máxima entre cumplir el umbral (TTL de staging 24 h / retención 90 días) y
// la purga efectiva sea ≤24 h. No hay cron real en el proceso Node (deuda de infraestructura fuera de
// alcance: en dev/prod un `setInterval` diario es suficiente; en un despliegue con orquestador, sustituir
// por un cron job externo que invoque este mismo módulo). Los tests de US3 llaman `runStagingGc`/
// `runRetentionPurge` DIRECTAMENTE (sin pasar por este scheduler).

// 90 días fijo, decidido en spec.md (Assumptions, FR-009/FR-018): NO es una variable de config abierta
// (un cambio de plazo sería una enmienda de spec, no una env var).
export const EVIDENCE_RETENTION_DAYS = 90;

const DAILY_MS = 86_400_000;

export interface ScheduleEvidenceJobsDeps {
  readonly storage: StoragePort;
  readonly prisma: PrismaClient;
  readonly stagingTtlMs: number;
  readonly logger: Logger;
}

/** Devuelve los timers (para poder `clearInterval` en tests/shutdown si hiciera falta). */
export function scheduleEvidenceJobs(deps: ScheduleEvidenceJobsDeps): { stop: () => void } {
  const runOnce = async (): Promise<void> => {
    const now = new Date();
    try {
      const gc = await runStagingGc({ storage: deps.storage, prisma: deps.prisma, now, stagingTtlMs: deps.stagingTtlMs });
      const retention = await runRetentionPurge({
        storage: deps.storage,
        prisma: deps.prisma,
        now,
        retentionDays: EVIDENCE_RETENTION_DAYS,
      });
      deps.logger.info(
        { gcPurged: gc.purgedRefs.length, retentionPurged: retention.purgedRefs.length },
        'jobs de purga de evidencia ejecutados (FR-018/FR-024)',
      );
    } catch (e) {
      deps.logger.error({ err: e }, 'fallo en los jobs de purga de evidencia (se reintenta en el próximo ciclo)');
    }
  };

  // Primera pasada inmediata (no esperar 24h tras el arranque) + repetición diaria (≤24h de latencia, FR-018/FR-024).
  void runOnce();
  const timer = setInterval(() => void runOnce(), DAILY_MS);
  timer.unref?.(); // no mantiene vivo el proceso solo por este timer (tests/CLI cortos)

  return { stop: () => clearInterval(timer) };
}
