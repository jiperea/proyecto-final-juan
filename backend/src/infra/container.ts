import type { PrismaClient } from '@prisma/client';
import type { Config } from './config';
import type { AppDeps } from '../handlers/app';
import { Argon2PasswordHasher } from './crypto/password-hasher';
import { JwtTokenIssuer } from './crypto/token-issuer';
import { checkDb, createPrisma } from './prisma';
import { createLogger } from './logger';
import { InMemoryGraceCache } from './grace-cache/in-memory';
import { InMemoryRateLimit } from './ratelimit/in-memory';
import { PrismaIncidentSourceRepository } from './repositories/incident-source-repository';
import { ClaudeCliProvider } from './ai/claude-cli-provider';
import { MockAiSummaryProvider } from './ai/mock-provider';
import { PinoAccessLog } from './ai/access-logger';
import { RefreshSessionValidity } from './session-validity';
import { PrismaAccountState, PrismaProbeRepository } from './repositories/account-state';
import { PrismaOrderRepository } from './repositories/order-repository';
import { PrismaOrderDetailReader } from './repositories/order-detail-reader';
import { PinoDeniedAccessLogger } from './audit/denied-access-logger';
import { redactStructured } from '../domain/ai/pii-redactor';
import {
  PrismaOrderReassignmentRepository,
  PrismaOrderTransitionRepository,
  PrismaOrderVisibilityRepository,
  PrismaStartOrderWorkRepository,
  PrismaUserLookupRepository,
} from './repositories/order-write-side-repository';
import { PrismaOrderExecutionRepository } from './repositories/order-execution-repository';
import { PrismaReviewOrderRepository } from './repositories/order-review-repository';
import { PrismaRefreshTokenRepository } from './repositories/refresh-token-repository';
import { PrismaSessionRepository } from './repositories/session-repository';
import { PrismaUserRepository } from './repositories/user-repository';
import { InMemorySessionState } from './session-state/in-memory';
import { FsStorageAdapter } from './storage/fs-storage-adapter';
import { registerStorageFor } from './storage/storage-registry';
import { PrismaEvidenceUploadRepository } from './repositories/evidence-upload-repository';
import { PrismaEvidenceReadRepository } from './repositories/evidence-read-repository';

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

// 007 — adaptadores del resumen de incidencia por IA (extraído para acotar buildAdapters, max-lines-per-function).
function buildAiAdapters(prisma: PrismaClient, config: Config) {
  return {
    incidentSource: new PrismaIncidentSourceRepository(prisma),
    aiProvider:
      config.aiProvider === 'mock'
        ? new MockAiSummaryProvider()
        : new ClaudeCliProvider({ timeoutMs: config.aiTimeoutMs, temperature: config.aiTemperature, operable: config.aiOperable }),
    aiAccessLog: new PinoAccessLog(createLogger()),
    aiRateLimit: new InMemoryRateLimit({
      max: config.aiRateMax,
      windowMs: config.aiRateWindowMs,
      lockoutMs: config.aiRateWindowMs,
      lockoutSecret: config.lockoutSecret,
    }),
  };
}

// Instancia todos los adaptadores (puertos→infra) para un PrismaClient dado.
function buildAdapters(prisma: PrismaClient, config: Config) {
  const clock = { now: (): Date => new Date() };
  const accountState = new PrismaAccountState(prisma);
  const tokens = new JwtTokenIssuer({
    jwtSecret: config.jwtSecret,
    accessTtl: config.accessTtl,
    refreshTtlDays: config.refreshTtlDays,
  });
  const refreshTokens = new PrismaRefreshTokenRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  // 024 — StoragePort: blobs de evidencia cifrados en filesystem (dev/prod-local); en test se puede
  // sustituir por el fake en memoria (tests/helpers/fake-storage.ts) al construir AppDeps. Se registra
  // en el registro auxiliar (storage-registry) para que un repositorio instanciado FUERA del container
  // (tests white-box) pueda resolverlo por defecto (ver order-write-side-repository.ts).
  const storage = new FsStorageAdapter({ baseDir: config.evidenceStorageDir, encKey: config.evidenceEncKey, clock });
  registerStorageFor(prisma, storage);
  return {
    clock,
    accountState,
    tokens,
    sessions,
    refreshTokens,
    hasher: new Argon2PasswordHasher(),
    users: new PrismaUserRepository(prisma),
    probes: new PrismaProbeRepository(prisma),
    sessionState: new InMemorySessionState(accountState, config.sessionStateTtlMs),
    graceCache: new InMemoryGraceCache(config.graceMs),
    sessionValidity: new RefreshSessionValidity(tokens, refreshTokens, sessions, accountState, clock),
    orders: new PrismaOrderRepository(prisma),
    orderTransition: new PrismaOrderTransitionRepository(prisma),
    orderVisibility: new PrismaOrderVisibilityRepository(prisma),
    userLookup: new PrismaUserLookupRepository(prisma),
    orderReassignment: new PrismaOrderReassignmentRepository(prisma),
    startOrderWork: new PrismaStartOrderWorkRepository(prisma),
    orderExecution: new PrismaOrderExecutionRepository(
      prisma,
      storage,
      config.evidenceStagingTtlHours * 3_600_000,
    ),
    evidenceUploadLookup: new PrismaEvidenceUploadRepository(prisma),
    evidenceReader: new PrismaEvidenceReadRepository(prisma), // 024, US2 (getOrderEvidence)
    orderReview: new PrismaReviewOrderRepository(prisma),
    rateLimit: new InMemoryRateLimit({
      max: config.lockoutMax,
      windowMs: config.lockoutWindowMin * MIN_MS,
      lockoutMs: config.lockoutWindowMin * MIN_MS,
      lockoutSecret: config.lockoutSecret,
    }),
    ...buildAiAdapters(prisma, config), // 007
    storage,
  };
}

// Wiring de dependencias (puertos→adaptadores). Único lugar donde se instancian los adaptadores.
type Adapters = ReturnType<typeof buildAdapters>;

// Deps de auth (login/logout/refresh) — extraído para acotar el tamaño de buildContainer (max-lines-per-function).
function authDeps(a: Adapters, config: Config): Pick<AppDeps, 'loginDeps' | 'logoutDeps' | 'refreshDeps'> {
  return {
    loginDeps: {
      users: a.users,
      sessions: a.sessions,
      refreshTokens: a.refreshTokens,
      hasher: a.hasher,
      tokens: a.tokens,
      rateLimit: a.rateLimit,
      clock: a.clock,
    },
    logoutDeps: {
      sessions: a.sessions,
      refreshTokens: a.refreshTokens,
      sessionState: a.sessionState,
      tokens: a.tokens,
      clock: a.clock,
      graceMs: config.graceMs,
    },
    refreshDeps: {
      users: a.users,
      sessions: a.sessions,
      refreshTokens: a.refreshTokens,
      sessionState: a.sessionState,
      accountState: a.accountState,
      graceCache: a.graceCache,
      tokens: a.tokens,
      clock: a.clock,
      graceMs: config.graceMs,
    },
  };
}

export function buildContainer(config: Config): { deps: AppDeps; prisma: PrismaClient; storage: Adapters['storage'] } {
  const prisma = createPrisma(config.databaseUrl);
  const a = buildAdapters(prisma, config);
  const deps: AppDeps = {
    checkDb: () => checkDb(prisma),
    ...authDeps(a, config),
    users: a.users,
    probes: a.probes,
    tokens: a.tokens,
    sessionState: a.sessionState,
    sessionValidity: a.sessionValidity,
    orderListDeps: { orders: a.orders },
    orderTransition: a.orderTransition, // 002b (dominio puro; sin ruta)
    reassignDeps: { visibility: a.orderVisibility, users: a.userLookup, reassignment: a.orderReassignment },
    startDeps: { start: a.startOrderWork }, // 005 US1
    executionDeps: { execution: a.orderExecution }, // 005 US2
    reviewDeps: { review: a.orderReview }, // 006
    summaryDeps: {
      source: a.incidentSource,
      provider: a.aiProvider,
      accessLog: a.aiAccessLog,
      rateLimit: a.aiRateLimit,
      thresholds: { minNotesChars: config.aiMinNotesChars, minEvidence: config.aiMinEvidence },
    }, // 007
    orderDetailDeps: {
      reader: new PrismaOrderDetailReader(prisma),
      redactor: { redact: redactStructured },
      deniedLogger: new PinoDeniedAccessLogger(createLogger()),
    }, // 008/#010
    uploadEvidenceDeps: { storage: a.storage, lookup: a.evidenceUploadLookup }, // 024, US1
    getEvidenceDeps: {
      reader: a.evidenceReader,
      storage: a.storage,
      deniedLogger: new PinoDeniedAccessLogger(createLogger()),
      signTtlSeconds: config.evidenceSignTtlSeconds,
    }, // 024, US2

    cookie: {
      refreshMaxAgeMs: config.refreshTtlDays * DAY_MS,
      secure: config.nodeEnv === 'production',
    },
  };
  return { deps, prisma, storage: a.storage };
}
