import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface PlatformAdminJwtPayload {
  sub: string;
  scope: 'platform';
}

export interface PlatformAdminPrincipal {
  platformAdminId: string;
}

/** Registered under the 'platform-jwt' Passport strategy name (distinct
 *  from the tenant-scoped 'jwt' strategy in ../auth/jwt.strategy.ts) so a
 *  platform-admin token and a tenant-user token are never interchangeable
 *  — see PlatformAdminJwtAuthGuard and JwtStrategy's own rejection of
 *  `scope: 'platform'`. */
@Injectable()
export class PlatformAdminJwtStrategy extends PassportStrategy(Strategy, 'platform-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-only-change-me',
    });
  }

  validate(payload: PlatformAdminJwtPayload): PlatformAdminPrincipal {
    if (payload.scope !== 'platform') {
      throw new UnauthorizedException('This token is not valid for platform-admin routes.');
    }
    return { platformAdminId: payload.sub };
  }
}
