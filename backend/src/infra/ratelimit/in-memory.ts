import { createHmac } from 'node:crypto';
import type { RateLimitDecision, RateLimitPort } from '../../domain/ports/services';

export interface RateLimitConfig {
  readonly max: number;
  readonly windowMs: number;
  readonly lockoutMs: number;
  readonly lockoutSecret: string;
  readonly now?: () => number;
}

interface Entry {
  windowStart: number;
  count: number;
  lockedUntil: number | null;
}

// Lockout in-memory (slice single-instance, D7). Atomicidad concurrente → BL-020; Redis → BL-018.
export class InMemoryRateLimit implements RateLimitPort {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(private readonly cfg: RateLimitConfig) {
    this.now = cfg.now ?? Date.now;
  }

  private decision(lockedUntil: number | null, now: number): RateLimitDecision {
    if (lockedUntil !== null && lockedUntil > now) {
      return { locked: true, retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000) };
    }
    return { locked: false, retryAfterSeconds: 0 };
  }

  check(key: string): RateLimitDecision {
    const entry = this.entries.get(key);
    return this.decision(entry?.lockedUntil ?? null, this.now());
  }

  registerFailure(key: string): RateLimitDecision {
    const now = this.now();
    let entry = this.entries.get(key);

    // Durante el bloqueo no se extiende (FR-011).
    if (entry && entry.lockedUntil !== null && entry.lockedUntil > now) {
      return this.decision(entry.lockedUntil, now);
    }
    // Ventana nueva si no existe, si caducó, o si el bloqueo anterior ya expiró.
    if (
      !entry ||
      now - entry.windowStart >= this.cfg.windowMs ||
      (entry.lockedUntil !== null && entry.lockedUntil <= now)
    ) {
      entry = { windowStart: now, count: 0, lockedUntil: null };
    }
    entry.count += 1;
    if (entry.count >= this.cfg.max) {
      entry.lockedUntil = now + this.cfg.lockoutMs;
    }
    this.entries.set(key, entry);
    return this.decision(entry.lockedUntil, now);
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  keyForIdentifier(identifierNorm: string): string {
    return createHmac('sha256', this.cfg.lockoutSecret).update(identifierNorm).digest('hex');
  }
}
