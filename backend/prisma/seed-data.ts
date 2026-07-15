import type { Role } from '../src/domain/model';

// Fixtures deterministas compartidos por el seed y los tests de integración (FR-002b/017b, D10).
// Contraseña común (≥12 chars) para todos los usuarios semilla.
export const SEED_PASSWORD = 'SuperSecret123!';

export interface SeedUser {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly role: Role;
  readonly disabled?: boolean;
  readonly lockedMinutes?: number; // locked_until = now + N min
}

export const SEED_USERS = {
  dispatcher: {
    id: '018f1000-0000-7000-8000-000000000001',
    email: 'dispatcher@fieldops.test',
    username: 'dispatcher1',
    role: 'dispatcher',
  },
  technician: {
    id: '018f1000-0000-7000-8000-000000000002',
    email: 'technician@fieldops.test',
    username: 'technician1',
    role: 'technician',
  },
  supervisor: {
    id: '018f1000-0000-7000-8000-000000000003',
    email: 'supervisor@fieldops.test',
    username: 'supervisor1',
    role: 'supervisor',
  },
  disabled: {
    id: '018f1000-0000-7000-8000-000000000004',
    email: 'disabled@fieldops.test',
    username: 'disabled1',
    role: 'technician',
    disabled: true,
  },
  locked: {
    id: '018f1000-0000-7000-8000-000000000005',
    email: 'locked@fieldops.test',
    username: 'locked1',
    role: 'dispatcher',
    lockedMinutes: 1440, // 24h: robusto para tests (evita caducidad del lock durante la sesión)
  },
  // 002a: segundo/tercer technician para IDOR mismo-estado y lista vacía.
  technician2: {
    id: '018f1000-0000-7000-8000-000000000006',
    email: 'technician2@fieldops.test',
    username: 'technician2',
    role: 'technician',
  },
  technician3: {
    id: '018f1000-0000-7000-8000-000000000007',
    email: 'technician3@fieldops.test',
    username: 'technician3',
    role: 'technician',
  },
  // 004 — técnicos DEDICADOS a los tests de reasignación (aislamiento: sus listas no las asevera 002a,
  // evita la carrera de conteo con FR-015 sobre technician1). No se siembran órdenes para ellos.
  reassignSrc: {
    id: '018f1000-0000-7000-8000-000000000008',
    email: 'reassign-src@fieldops.test',
    username: 'reassignsrc',
    role: 'technician',
  },
  reassignDst: {
    id: '018f1000-0000-7000-8000-000000000009',
    email: 'reassign-dst@fieldops.test',
    username: 'reassigndst',
    role: 'technician',
  },
} as const satisfies Record<string, SeedUser>;

// 002a — anclas de órdenes para tests deterministas (IDOR, tiebreak). El resto se genera como relleno.
export const SEED_ORDERS = {
  tech2PendingReview: '018f2000-0000-7000-8000-0000000000b2', // pending_review de technician2 (IDOR)
  tiePairHi: '018f2000-0000-7000-8000-0000000000f2', // mismo created_at que tiePairLo; id mayor
  tiePairLo: '018f2000-0000-7000-8000-0000000000f1', // mismo created_at que tiePairHi; id menor
  // 019 — pending_review de technician1 CON evidencia+audit sembrados → APROBABLE desde un arranque limpio
  // (para demostrar el flujo aprobar del supervisor sin tener que ejecutar antes el paso del técnico).
  approvableReview: '018f2000-0000-7000-8000-0000000000a1',
} as const;

// created_at compartido por el par de tiebreak (mismo instante) → obliga a desempatar por id.
export const TIE_CREATED_AT = new Date('2026-07-01T12:00:00.000Z');

export interface SeedProbe {
  readonly id: string;
  readonly inScopeRoles: readonly Role[];
}

// probe-A: 200 dispatcher+supervisor · probe-B: 200 supervisor / 404-alcance dispatcher
// probe-C: 200 dispatcher / 404-alcance supervisor · NONEXISTENT: 404-inexistencia
export const SEED_PROBES = {
  A: { id: '018f1000-0000-7000-8000-00000000000a', inScopeRoles: ['dispatcher', 'supervisor'] },
  B: { id: '018f1000-0000-7000-8000-00000000000b', inScopeRoles: ['supervisor'] },
  C: { id: '018f1000-0000-7000-8000-00000000000c', inScopeRoles: ['dispatcher'] },
} as const satisfies Record<string, SeedProbe>;

export const NONEXISTENT_PROBE_ID = '018f1000-0000-7000-8000-0000000000ff';
