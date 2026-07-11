import type { PrismaClient } from '@prisma/client';
import type { Config } from './config';
import type { AppDeps } from '../handlers/app';
import { Argon2PasswordHasher } from './crypto/password-hasher';
import { JwtTokenIssuer } from './crypto/token-issuer';
import { checkDb, createPrisma } from './prisma';
import { InMemoryRateLimit } from './ratelimit/in-memory';
import { PrismaAccountState, PrismaProbeRepository } from './repositories/account-state';
import { PrismaRefreshTokenRepository } from './repositories/refresh-token-repository';
import { PrismaSessionRepository } from './repositories/session-repository';
import { PrismaUserRepository } from './repositories/user-repository';
import { InMemorySessionState } from './session-state/in-memory';

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

// Wiring de dependencias (puertos→adaptadores). Único lugar donde se instancian los adaptadores.
export function buildContainer(config: Config): { deps: AppDeps; prisma: PrismaClient } {
  const prisma = createPrisma(config.databaseUrl);
  const clock = { now: (): Date => new Date() };

  const hasher = new Argon2PasswordHasher();
  const tokens = new JwtTokenIssuer({
    jwtSecret: config.jwtSecret,
    accessTtl: config.accessTtl,
    refreshTtlDays: config.refreshTtlDays,
  });
  const users = new PrismaUserRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const refreshTokens = new PrismaRefreshTokenRepository(prisma);
  const accountState = new PrismaAccountState(prisma);
  const probes = new PrismaProbeRepository(prisma);
  const sessionState = new InMemorySessionState(accountState, config.sessionStateTtlMs);
  const rateLimit = new InMemoryRateLimit({
    max: config.lockoutMax,
    windowMs: config.lockoutWindowMin * MIN_MS,
    lockoutMs: config.lockoutWindowMin * MIN_MS,
    lockoutSecret: config.lockoutSecret,
  });

  const deps: AppDeps = {
    checkDb: () => checkDb(prisma),
    loginDeps: { users, sessions, refreshTokens, hasher, tokens, rateLimit, clock },
    logoutDeps: { sessions, refreshTokens, sessionState, tokens, clock, graceMs: config.graceMs },
    users,
    probes,
    tokens,
    sessionState,
    cookie: {
      refreshMaxAgeMs: config.refreshTtlDays * DAY_MS,
      secure: config.nodeEnv === 'production',
    },
  };
  return { deps, prisma };
}
