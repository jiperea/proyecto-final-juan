import { z } from 'zod';
import { isValidEvidenceEncKey } from './evidence-enc-key';

// Validación de configuración con Zod y arranque fail-fast (FR-016).
// Los 3 secretos HMAC/JWT deben ser distintos entre sí (pairwise-distinct, S-002/D8).

const schema = z.object({
  JWT_SECRET: z.string().min(32),
  CSRF_HMAC_SECRET: z.string().min(32),
  LOCKOUT_HMAC_SECRET: z.string().min(32),
  DATABASE_URL: z.string().min(1),
  ACCESS_TTL: z.coerce.number().int().positive(),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive(),
  GRACE_MS: z.coerce.number().int().nonnegative(),
  LOCKOUT_MAX: z.coerce.number().int().positive(),
  LOCKOUT_WINDOW_MIN: z.coerce.number().int().positive(),
  SESSION_STATE_TTL_MS: z.coerce.number().int().positive(),
  DB_QUERY_TIMEOUT_MS: z.coerce.number().int().positive(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // --- 007: resumen de incidencia por IA ---
  AI_PROVIDER: z.enum(['claude-cli', 'mock']).default('claude-cli'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000), // FR-010 timeout duro
  AI_TEMPERATURE: z.coerce.number().min(0).max(1).default(0), // FR-009b determinismo/reproducibilidad
  AI_MIN_NOTES_CHARS: z.coerce.number().int().nonnegative().default(30), // FR-015 umbral (Constitution VIII)
  AI_MIN_EVIDENCE: z.coerce.number().int().nonnegative().default(1), // FR-015 nº mínimo de evidencia
  AI_RATE_MAX: z.coerce.number().int().positive().default(10), // FR-008 10/60s por usuario
  AI_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  // --- 024: evidencia fotográfica binaria y visualización por URL firmada ---
  // clave AES-256-GCM (S-002-like: secreto, min 32); regla compartida con el seed (026/FR-013).
  EVIDENCE_ENC_KEY: z.string().refine(isValidEvidenceEncKey, {
    message: 'EVIDENCE_ENC_KEY debe tener al menos 32 caracteres',
  }),
  EVIDENCE_SIGN_TTL_SECONDS: z.coerce.number().int().min(1).max(300).default(300), // firma de lectura ≤300s
  EVIDENCE_STAGING_TTL_HOURS: z.coerce.number().int().min(1).default(24), // TTL de staging antes de GC
  EVIDENCE_STORAGE_DIR: z.string().min(1).default('./data/evidence'), // directorio del store fs (dev/test)
});

export interface Config {
  readonly jwtSecret: string;
  readonly csrfSecret: string;
  readonly lockoutSecret: string;
  readonly databaseUrl: string;
  readonly accessTtl: number;
  readonly refreshTtlDays: number;
  readonly graceMs: number;
  readonly lockoutMax: number;
  readonly lockoutWindowMin: number;
  readonly sessionStateTtlMs: number;
  readonly dbQueryTimeoutMs: number;
  readonly port: number;
  readonly nodeEnv: 'development' | 'test' | 'production';
  // 007
  readonly aiProvider: 'claude-cli' | 'mock';
  readonly aiTimeoutMs: number;
  readonly aiTemperature: number;
  // 018/FR-006 — guard dev-only deny-by-default: el proveedor IA se considera operable SOLO en desarrollo
  // o con proveedor mock (tests). En pre/prod con claude-cli → no operable → AI_UNAVAILABLE (501).
  readonly aiOperable: boolean;
  readonly aiMinNotesChars: number;
  readonly aiMinEvidence: number;
  readonly aiRateMax: number;
  readonly aiRateWindowMs: number;
  // 024
  readonly evidenceEncKey: string;
  readonly evidenceSignTtlSeconds: number;
  readonly evidenceStagingTtlHours: number;
  readonly evidenceStorageDir: string;
}

function assertSecretsDistinct(jwt: string, csrf: string, lockout: string, evidenceEncKey: string): void {
  const entries = [
    ['JWT_SECRET', jwt],
    ['CSRF_HMAC_SECRET', csrf],
    ['LOCKOUT_HMAC_SECRET', lockout],
    ['EVIDENCE_ENC_KEY', evidenceEncKey],
  ] as const;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (a && b && a[1] === b[1]) {
        throw new Error(`Config inválida (S-002): los secretos ${a[0]} y ${b[0]} deben ser distintos`);
      }
    }
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const vars = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Config inválida (fail-fast, FR-016): revisa ${vars}`);
  }
  const v = parsed.data;
  assertSecretsDistinct(v.JWT_SECRET, v.CSRF_HMAC_SECRET, v.LOCKOUT_HMAC_SECRET, v.EVIDENCE_ENC_KEY);
  // 018/H-002 fail-fast: el proveedor mock produce resúmenes plantilla (sufficient:true SIEMPRE); NUNCA debe
  // llegar a producción (daría resúmenes falsos con apariencia de IA real). El guard dev-only no cubre el
  // branch mock del contenedor, así que se prohíbe aquí de forma estructural.
  if (v.NODE_ENV === 'production' && v.AI_PROVIDER === 'mock') {
    throw new Error('Config inválida (fail-fast, 018): AI_PROVIDER=mock no permitido con NODE_ENV=production.');
  }
  // 024 fail-fast: prohíbe una clave de cifrado de evidencia literalmente "mock" (coherente con el guard
  // 018/H-002 de AI_PROVIDER=mock); un valor simbólico de este tipo comprometería el cifrado AES-256-GCM.
  if (v.NODE_ENV === 'production' && /^mock$/i.test(v.EVIDENCE_ENC_KEY)) {
    throw new Error(
      'Config inválida (fail-fast, 024): EVIDENCE_ENC_KEY="mock" no permitido con NODE_ENV=production.',
    );
  }
  return {
    jwtSecret: v.JWT_SECRET,
    csrfSecret: v.CSRF_HMAC_SECRET,
    lockoutSecret: v.LOCKOUT_HMAC_SECRET,
    databaseUrl: v.DATABASE_URL,
    accessTtl: v.ACCESS_TTL,
    refreshTtlDays: v.REFRESH_TTL_DAYS,
    graceMs: v.GRACE_MS,
    lockoutMax: v.LOCKOUT_MAX,
    lockoutWindowMin: v.LOCKOUT_WINDOW_MIN,
    sessionStateTtlMs: v.SESSION_STATE_TTL_MS,
    dbQueryTimeoutMs: v.DB_QUERY_TIMEOUT_MS,
    port: v.PORT,
    nodeEnv: v.NODE_ENV,
    aiProvider: v.AI_PROVIDER,
    aiTimeoutMs: v.AI_TIMEOUT_MS,
    aiTemperature: v.AI_TEMPERATURE,
    aiOperable: v.NODE_ENV === 'development' || v.AI_PROVIDER === 'mock',
    aiMinNotesChars: v.AI_MIN_NOTES_CHARS,
    aiMinEvidence: v.AI_MIN_EVIDENCE,
    aiRateMax: v.AI_RATE_MAX,
    aiRateWindowMs: v.AI_RATE_WINDOW_MS,
    evidenceEncKey: v.EVIDENCE_ENC_KEY,
    evidenceSignTtlSeconds: v.EVIDENCE_SIGN_TTL_SECONDS,
    evidenceStagingTtlHours: v.EVIDENCE_STAGING_TTL_HOURS,
    evidenceStorageDir: v.EVIDENCE_STORAGE_DIR,
  };
}
