import type { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import type { SessionRecord } from '../../domain/model';
import type { SessionRepositoryPort } from '../../domain/ports/repositories';

export class PrismaSessionRepository implements SessionRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string): Promise<SessionRecord> {
    const s = await this.prisma.session.create({ data: { id: uuidv7(), userId } });
    return { id: s.id, userId: s.userId, revokedAt: s.revokedAt };
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const s = await this.prisma.session.findUnique({ where: { id } });
    return s ? { id: s.id, userId: s.userId, revokedAt: s.revokedAt } : null;
  }

  async revoke(id: string): Promise<boolean> {
    // Marca revoked_at sólo si no estaba revocada → true si esta llamada la revocó (logout no idempotente).
    const res = await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.count === 1;
  }
}
