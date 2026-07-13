import { normalizeIdentifier, type RefreshTokenRecord, type SessionRecord, type UserRecord } from '../../src/domain/model';
import type {
  AccountStatePort,
  RefreshTokenRepositoryPort,
  SessionRepositoryPort,
  UserRepositoryPort,
} from '../../src/domain/ports/repositories';
import type { ClockPort, PasswordHasherPort, SessionStatePort } from '../../src/domain/ports/services';
import type { AppDeps } from '../../src/handlers/app';
import { domainError, err } from '../../src/domain/result';
import { JwtTokenIssuer } from '../../src/infra/crypto/token-issuer';
import { InMemoryGraceCache } from '../../src/infra/grace-cache/in-memory';
import { InMemoryRateLimit } from '../../src/infra/ratelimit/in-memory';

// Fakes in-memory para tests de dominio (hexagonal: sin BD ni infra real).

export function fakeUsers(list: readonly UserRecord[]): UserRepositoryPort {
  const byNorm = new Map<string, UserRecord>();
  for (const u of list) {
    byNorm.set(normalizeIdentifier(u.email), u);
    byNorm.set(normalizeIdentifier(u.username), u);
  }
  return {
    findByIdentifierNorm: async (n) => byNorm.get(n) ?? null,
    findById: async (id) => list.find((u) => u.id === id) ?? null,
  };
}

export interface FakeSessions extends SessionRepositoryPort {
  store: Map<string, SessionRecord>;
}

export function fakeSessions(): FakeSessions {
  const store = new Map<string, SessionRecord>();
  let n = 0;
  return {
    store,
    create: async (userId) => {
      const s: SessionRecord = { id: `sid-${++n}`, userId, revokedAt: null };
      store.set(s.id, s);
      return s;
    },
    findById: async (id) => store.get(id) ?? null,
    revoke: async (id) => {
      const s = store.get(id);
      if (!s || s.revokedAt) {
        return false;
      }
      store.set(id, { ...s, revokedAt: new Date() });
      return true;
    },
  };
}

export interface FakeRefreshTokens extends RefreshTokenRepositoryPort {
  store: Map<string, RefreshTokenRecord>;
}

export function fakeRefreshTokens(): FakeRefreshTokens {
  const store = new Map<string, RefreshTokenRecord>(); // por id
  let n = 0;
  return {
    store,
    create: async ({ sessionId, tokenHash, expiresAt }) => {
      const rt: RefreshTokenRecord = {
        id: `rt-${++n}`,
        sessionId,
        tokenHash,
        expiresAt,
        rotatedAt: null,
        replacedBy: null,
      };
      store.set(rt.id, rt);
      return rt;
    },
    findByHash: async (hash) => [...store.values()].find((r) => r.tokenHash === hash) ?? null,
    rotateAtomic: async (tokenId, replacedById) => {
      const rt = store.get(tokenId);
      if (!rt || rt.rotatedAt) {
        return false;
      }
      store.set(tokenId, { ...rt, rotatedAt: new Date(), replacedBy: replacedById });
      return true;
    },
  };
}

/** Hasher rápido para tests (sin argon2). `matches` decide validez. */
export function fakeHasher(matches: (hash: string, plain: string) => boolean): PasswordHasherPort {
  return {
    hash: async (plain) => `hash:${plain}`,
    verify: async (hash, plain) => matches(hash, plain),
    dummyVerify: async () => undefined,
  };
}

export function fixedClock(ms: number): ClockPort {
  return { now: () => new Date(ms) };
}

export function fakeAccountState(over: Partial<AccountStatePort> = {}): AccountStatePort {
  return {
    isSessionRevoked: async () => false,
    isUserDisabled: async () => false,
    ...over,
  };
}

// AppDeps completo con fakes inofensivos, para tests que sólo ejercitan ops/headers/correlation.
export function minimalAppDeps(over: Partial<AppDeps> = {}): AppDeps {
  const tokens = new JwtTokenIssuer({ jwtSecret: 'j'.repeat(40), accessTtl: 900, refreshTtlDays: 7 });
  const users = fakeUsers([]);
  const sessions = fakeSessions();
  const refreshTokens = fakeRefreshTokens();
  const hasher = fakeHasher(() => false);
  const rateLimit = new InMemoryRateLimit({
    max: 5,
    windowMs: 900_000,
    lockoutMs: 900_000,
    lockoutSecret: 'l'.repeat(40),
  });
  const clock = fixedClock(1000);
  const sessionState: SessionStatePort = {
    isRevoked: async () => false,
    isUserActive: async () => true,
    revokeSession: () => undefined,
  };
  return {
    checkDb: async () => true,
    loginDeps: { users, sessions, refreshTokens, hasher, tokens, rateLimit, clock },
    logoutDeps: { sessions, refreshTokens, sessionState, tokens, clock, graceMs: 10_000 },
    refreshDeps: {
      users,
      sessions,
      refreshTokens,
      sessionState,
      accountState: fakeAccountState(),
      graceCache: new InMemoryGraceCache(10_000),
      tokens,
      clock,
      graceMs: 10_000,
    },
    users,
    probes: { findInScopeRoles: async () => null },
    tokens,
    sessionState,
    sessionValidity: { isSessionValid: async () => true },
    orderListDeps: { orders: { listForScope: async () => [] } },
    orderTransition: {
      applyTransition: async () => err(domainError('ORDER_NOT_FOUND', 'no-op fake')),
    },
    reassignDeps: {
      visibility: { findReassignable: async () => null },
      users: { findAssignableTechnician: async () => null },
      reassignment: { reassign: async () => err(domainError('ORDER_NOT_FOUND', 'no-op fake')) },
    },
    startDeps: { start: { startWork: async () => err(domainError('ORDER_NOT_FOUND', 'no-op fake')) } },
    cookie: { refreshMaxAgeMs: 7 * 86_400_000, secure: false },
    ...over,
  };
}
