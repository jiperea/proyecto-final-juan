import type { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import type { RefreshTokenRecord } from '../../domain/model';
import type {
  CreateRefreshTokenInput,
  RefreshTokenRepositoryPort,
} from '../../domain/ports/repositories';

export class PrismaRefreshTokenRepository implements RefreshTokenRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    const rt = await this.prisma.refreshToken.create({
      data: {
        id: uuidv7(),
        sessionId: input.sessionId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
    return {
      id: rt.id,
      sessionId: rt.sessionId,
      tokenHash: rt.tokenHash,
      expiresAt: rt.expiresAt,
      rotatedAt: rt.rotatedAt,
      replacedBy: rt.replacedBy,
    };
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const rt = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return rt
      ? {
          id: rt.id,
          sessionId: rt.sessionId,
          tokenHash: rt.tokenHash,
          expiresAt: rt.expiresAt,
          rotatedAt: rt.rotatedAt,
          replacedBy: rt.replacedBy,
        }
      : null;
  }

  // Rotación single-use que exige sesión no revocada (D6/H-001). Transacción: sólo una petición gana.
  async rotateAtomic(tokenId: string, replacedById: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rt = await tx.refreshToken.findUnique({
        where: { id: tokenId },
        include: { session: true },
      });
      if (!rt || rt.rotatedAt || rt.session.revokedAt) {
        return false;
      }
      const res = await tx.refreshToken.updateMany({
        where: { id: tokenId, rotatedAt: null },
        data: { rotatedAt: new Date(), replacedBy: replacedById },
      });
      return res.count === 1;
    });
  }
}
