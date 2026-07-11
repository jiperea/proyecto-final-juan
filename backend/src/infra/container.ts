import type { PrismaClient } from '@prisma/client';
import type { Config } from './config';
import type { AppDeps } from '../handlers/app';
import { Argon2PasswordHasher } from './crypto/password-hasher';
import { JwtTokenIssuer } from './crypto/token-issuer';
import { checkDb, createPrisma } from './prisma';
import { InMemoryGraceCache } from './grace-cache/in-memory';
import { InMemoryRateLimit } from './ratelimit/in-memory';
import { RefreshSessionValidity } from './session-validity';
import { PrismaAccountState, PrismaProbeRepository } from './repositories/account-state';
import { PrismaRefreshTokenRepository } from './repositories/refresh-token-repository';
import { PrismaSessionRepository } from './repositories/session-repository';
import { PrismaUserRepository } from './repositories/user-repository';
import { InMemorySessionState } from './session-state/in-memory';

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

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
    rateLimit: new InMemoryRateLimit({
      max: config.lockoutMax,
      windowMs: config.lockoutWindowMin * MIN_MS,
      lockoutMs: config.lockoutWindowMin * MIN_MS,
      lockoutSecret: config.lockoutSecret,
    }),
  };
}

// Wiring de dependencias (puertos→adaptadores). Único lugar donde se instancian los adaptadores.
export function buildContainer(config: Config): { deps: AppDeps; prisma: PrismaClient } {
  const prisma = createPrisma(config.databaseUrl);
  const a = buildAdapters(prisma, config);
  const deps: AppDeps = {
    checkDb: () => checkDb(prisma),
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
    users: a.users,
    probes: a.probes,
    tokens: a.tokens,
    sessionState: a.sessionState,
    sessionValidity: a.sessionValidity,
    cookie: {
      refreshMaxAgeMs: config.refreshTtlDays * DAY_MS,
      secure: config.nodeEnv === 'production',
    },
  };
  return { deps, prisma };
}
