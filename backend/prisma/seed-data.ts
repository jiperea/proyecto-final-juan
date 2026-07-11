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
    lockedMinutes: 15,
  },
} as const satisfies Record<string, SeedUser>;

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
