import { SetMetadata } from '@nestjs/common';
import type { AuthenticatedUser } from './current-user.decorator';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AuthenticatedUser['role'][]) => SetMetadata(ROLES_KEY, roles);
