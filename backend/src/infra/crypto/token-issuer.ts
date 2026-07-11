import { createHash, randomBytes } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { ROLES, type Role } from '../../domain/model';
import type { AccessClaims, IssuedTokens, TokenIssuerPort } from '../../domain/ports/services';

export interface JwtConfig {
  readonly jwtSecret: string;
  readonly accessTtl: number; // segundos
  readonly refreshTtlDays: number;
}

const DAY_MS = 86_400_000;

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

// Access = JWT HS256 corto; refresh = token opaco (256-bit), en BD sólo su hash SHA-256 (D5).
export class JwtTokenIssuer implements TokenIssuerPort {
  constructor(private readonly cfg: JwtConfig) {}

  issue(claims: AccessClaims): IssuedTokens {
    const accessToken = jwt.sign(
      { sub: claims.sub, sid: claims.sid, role: claims.role },
      this.cfg.jwtSecret,
      { algorithm: 'HS256', expiresIn: this.cfg.accessTtl },
    );
    const refreshToken = randomBytes(32).toString('hex');
    return {
      accessToken,
      expiresIn: this.cfg.accessTtl,
      refreshToken,
      refreshTokenHash: this.hashRefresh(refreshToken),
      refreshExpiresAt: new Date(Date.now() + this.cfg.refreshTtlDays * DAY_MS),
      csrfToken: randomBytes(32).toString('hex'),
    };
  }

  verifyAccess(token: string): AccessClaims | null {
    try {
      const payload = jwt.verify(token, this.cfg.jwtSecret, { algorithms: ['HS256'] });
      if (typeof payload === 'string') {
        return null;
      }
      const { sub, sid, role } = payload as JwtPayload & { sid?: unknown; role?: unknown };
      if (typeof sub === 'string' && typeof sid === 'string' && isRole(role)) {
        return { sub, sid, role };
      }
      return null;
    } catch {
      return null;
    }
  }

  hashRefresh(opaqueToken: string): string {
    return createHash('sha256').update(opaqueToken).digest('hex');
  }
}
