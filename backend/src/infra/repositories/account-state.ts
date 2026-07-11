import type { PrismaClient } from '@prisma/client';
import type { Role } from '../../domain/model';
import type { AccountStatePort, ProbeResourceRepositoryPort } from '../../domain/ports/repositories';

// Consulta autoritativa de estado (fallback de la caché de revocación y camino de refresh).
// Sesión/usuario inexistente → se trata como revocado/disabled (deny, fail-closed conservador).
export class PrismaAccountState implements AccountStatePort {
  constructor(private readonly prisma: PrismaClient) {}

  async isSessionRevoked(sessionId: string): Promise<boolean> {
    const s = await this.prisma.session.findUnique({ where: { id: sessionId } });
    return s ? s.revokedAt !== null : true;
  }

  async isUserDisabled(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    return u ? u.disabledAt !== null : true;
  }
}

export class PrismaProbeRepository implements ProbeResourceRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findInScopeRoles(id: string): Promise<readonly Role[] | null> {
    const p = await this.prisma.probeResource.findUnique({ where: { id } });
    return p ? (p.inScopeRoles as Role[]) : null;
  }
}
