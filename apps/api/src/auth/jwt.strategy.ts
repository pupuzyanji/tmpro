import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ACCESS_ENDED_MESSAGE, employeeAccessEndedCached } from './account-security';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: AuthenticatedUser['role'];
  employeeId: string | null;
  // Only ever present (and only ever 'platform') on a platform-admin token
  // issued by PlatformAdminAuthService — see that file and
  // platform-admin-jwt.strategy.ts. Rejected here so a platform-admin token
  // can never be replayed against tenant-scoped routes.
  scope?: 'platform';
  // v027.A — "must change password": the only thing this token can do is
  // POST /api/auth/change-password, which issues a normal token.
  mcp?: boolean;
}

// Routes a must-change-password token may still call.
const MCP_ALLOWED = ['/api/auth/change-password'];

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-only-change-me',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.scope === 'platform') {
      throw new UnauthorizedException('This token is not valid for tenant routes.');
    }
    // v027.A — someone marked as having left loses access within a minute,
    // even mid-session.
    if (payload.employeeId && (await employeeAccessEndedCached(payload.tenantId, payload.employeeId))) {
      throw new UnauthorizedException(ACCESS_ENDED_MESSAGE);
    }
    if (payload.mcp) {
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
      if (!MCP_ALLOWED.includes(path)) {
        throw new ForbiddenException('Please choose a new password before continuing.');
      }
    }
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      employeeId: payload.employeeId,
    };
  }
}
