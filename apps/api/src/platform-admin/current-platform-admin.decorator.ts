import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PlatformAdminPrincipal } from './platform-admin-jwt.strategy';

export const CurrentPlatformAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): PlatformAdminPrincipal => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
