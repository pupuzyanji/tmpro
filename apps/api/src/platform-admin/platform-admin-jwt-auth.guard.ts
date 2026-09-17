import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class PlatformAdminJwtAuthGuard extends AuthGuard('platform-jwt') {}
