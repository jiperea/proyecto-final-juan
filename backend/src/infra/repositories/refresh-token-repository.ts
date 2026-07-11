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

  // Rotación single-use ATÓMICA que exige sesión no revocada (D6/H-001, cierra TOCTOU logout↔refresh).
  // Un ÚNICO UPDATE con EXISTS: no hay ventana entre leer y escribir; sólo una petición concurrente gana.
  async rotateAtomic(tokenId: string, replacedById: string): Promise<boolean> {
    const affected = await this.prisma.$executeRaw`
      UPDATE refresh_tokens
      SET rotated_at = now(), replaced_by = ${replacedById}::uuid
      WHERE id = ${tokenId}::uuid
        AND rotated_at IS NULL
        AND EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = refresh_tokens.session_id AND s.revoked_at IS NULL
        )`;
    return affected === 1;
  }
}
