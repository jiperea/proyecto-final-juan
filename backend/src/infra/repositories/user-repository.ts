import type { PrismaClient, User as PrismaUser } from '@prisma/client';
import type { Role, UserRecord } from '../../domain/model';
import type { UserRepositoryPort } from '../../domain/ports/repositories';

function toRecord(u: PrismaUser): UserRecord {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    passwordHash: u.passwordHash,
    role: u.role as Role,
    lockedUntil: u.lockedUntil,
    disabledAt: u.disabledAt,
  };
}

export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findByIdentifierNorm(identifierNorm: string): Promise<UserRecord | null> {
    const idf = await this.prisma.identifier.findUnique({
      where: { norm: identifierNorm },
      include: { user: true },
    });
    return idf ? toRecord(idf.user) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    return u ? toRecord(u) : null;
  }
}
