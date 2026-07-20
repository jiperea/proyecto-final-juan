// 026 (T003 · US3 · FR-003/FR-004) — Fase RED. Guard dev-local POSITIVO del seed: aborta ANTES de escribir
// nada salvo NODE_ENV≠'production' Y hostname de DATABASE_URL (match EXACTO) ∈ {db, localhost, 127.0.0.1}, Y
// EVIDENCE_ENC_KEY válida (≥32). El mensaje nombra la causa pero NUNCA interpola la DATABASE_URL completa
// (credenciales) ni el valor de EVIDENCE_ENC_KEY.
//
// `assertDevLocalOrThrow` AÚN NO EXISTE en `backend/prisma/seed.ts` — lo crea `dev-backend` (T004) con la
// firma esperada `export function assertDevLocalOrThrow(env: NodeJS.ProcessEnv): void`. Hasta entonces este
// import falla y TODO el fichero es rojo por la razón correcta (el guard no existe todavía).
import { describe, expect, it } from 'vitest';
import { assertDevLocalOrThrow } from '../../prisma/seed';

const PASSWORD = 'sup3r-s3cret-password';
const validEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'development',
  DATABASE_URL: `postgresql://fieldops:${PASSWORD}@db:5432/fieldops`,
  EVIDENCE_ENC_KEY: 'e'.repeat(40),
});

describe('026 · guard dev-local del seed (FR-003/FR-004)', () => {
  it('NODE_ENV=production → aborta ANTES de nada (exit≠0 vía throw), nombra la causa', () => {
    const env = { ...validEnv(), NODE_ENV: 'production' };
    let thrown: Error | undefined;
    try {
      assertDevLocalOrThrow(env);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown?.message).toMatch(/NODE_ENV/i);
    expect(thrown?.message).toMatch(/production/i);
    // NUNCA interpola la DATABASE_URL completa (con credenciales) en el mensaje.
    expect(thrown?.message).not.toContain(PASSWORD);
    expect(thrown?.message).not.toContain('fieldops:');
  });

  it('hostname de DATABASE_URL ∉ {db,localhost,127.0.0.1} (match EXACTO) → aborta nombrando SOLO el hostname', () => {
    const env = { ...validEnv(), DATABASE_URL: `postgresql://fieldops:${PASSWORD}@evil-db.example.com:5432/fieldops` };
    let thrown: Error | undefined;
    try {
      assertDevLocalOrThrow(env);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown?.message).toContain('evil-db.example.com'); // nombra el hostname rechazado
    expect(thrown?.message).not.toContain(PASSWORD); // nunca password
    expect(thrown?.message).not.toContain('fieldops:'); // nunca la URL completa con credenciales
  });

  it('rechaza otros hosts externos por match EXACTO (no subcadena): mydb.neon.tech', () => {
    const env = { ...validEnv(), DATABASE_URL: `postgresql://u:p@mydb.neon.tech:5432/fieldops` };
    expect(() => assertDevLocalOrThrow(env)).toThrow();
  });

  it('acepta db/localhost/127.0.0.1 por igualdad exacta (con NODE_ENV≠production y clave válida)', () => {
    for (const host of ['db', 'localhost', '127.0.0.1']) {
      const env = { ...validEnv(), DATABASE_URL: `postgresql://u:p@${host}:5432/fieldops` };
      expect(() => assertDevLocalOrThrow(env)).not.toThrow();
    }
  });

  it('EVIDENCE_ENC_KEY ausente → aborta nombrando la variable y la acción, SIN el valor', () => {
    const env = { ...validEnv() };
    delete env.EVIDENCE_ENC_KEY;
    let thrown: Error | undefined;
    try {
      assertDevLocalOrThrow(env);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown?.message).toMatch(/EVIDENCE_ENC_KEY/);
    expect(thrown?.message).toMatch(/32|backend\/\.env|defin/i); // acción correctiva
  });

  it('EVIDENCE_ENC_KEY <32 caracteres → aborta SIN interpolar el valor de la clave', () => {
    const shortKey = 'clave-demasiado-corta';
    const env = { ...validEnv(), EVIDENCE_ENC_KEY: shortKey };
    let thrown: Error | undefined;
    try {
      assertDevLocalOrThrow(env);
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown?.message).toMatch(/EVIDENCE_ENC_KEY/);
    expect(thrown?.message).not.toContain(shortKey);
  });

  it('entorno dev-local válido completo → NO aborta', () => {
    expect(() => assertDevLocalOrThrow(validEnv())).not.toThrow();
  });
});
