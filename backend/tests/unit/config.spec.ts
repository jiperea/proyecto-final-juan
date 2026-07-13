import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/infra/config';

// Entorno mínimo válido (los 3 secretos distintos entre sí, ≥32 chars).
const base: Record<string, string> = {
  JWT_SECRET: 'a'.repeat(40),
  CSRF_HMAC_SECRET: 'b'.repeat(40),
  LOCKOUT_HMAC_SECRET: 'c'.repeat(40),
  DATABASE_URL: 'postgresql://fieldops:fieldops@localhost:5432/fieldops',
  ACCESS_TTL: '900',
  REFRESH_TTL_DAYS: '7',
  GRACE_MS: '10000',
  LOCKOUT_MAX: '5',
  LOCKOUT_WINDOW_MIN: '15',
  SESSION_STATE_TTL_MS: '30000',
  DB_QUERY_TIMEOUT_MS: '2000',
  PORT: '3000',
  NODE_ENV: 'test',
};

describe('config fail-fast (FR-016)', () => {
  it('parsea un entorno válido y expone valores tipados', () => {
    const cfg = loadConfig(base);
    expect(cfg.accessTtl).toBe(900);
    expect(cfg.graceMs).toBe(10000);
    expect(cfg.jwtSecret).toHaveLength(40);
  });

  it('007: defaults IA (FR-009b/FR-015) — temperature=0, umbrales 30/1, rate 10/60s', () => {
    const cfg = loadConfig(base); // sin AI_* → defaults normativos
    expect(cfg.aiTemperature).toBe(0); // FR-009b: temperatura fijada en la spec (config default)
    expect(cfg.aiMinNotesChars).toBe(30);
    expect(cfg.aiMinEvidence).toBe(1);
    expect(cfg.aiProvider).toBe('claude-cli');
  });

  it('aborta nombrando la variable que falta', () => {
    const withoutJwt: Record<string, string> = { ...base };
    delete withoutJwt.JWT_SECRET;
    expect(() => loadConfig(withoutJwt)).toThrowError(/JWT_SECRET/);
  });

  it('aborta nombrando el par cuando dos de los 3 secretos son iguales (S-002)', () => {
    const bad = { ...base, CSRF_HMAC_SECRET: base.JWT_SECRET };
    expect(() => loadConfig(bad)).toThrowError(/JWT_SECRET.*CSRF_HMAC_SECRET|CSRF_HMAC_SECRET.*JWT_SECRET/);
  });
});
