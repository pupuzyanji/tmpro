import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

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
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-only-change-me',
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (payload.scope === 'platform') {
      throw new UnauthorizedException('This token is not valid for tenant routes.');
    }
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      employeeId: payload.employeeId,
    };
  }
}
