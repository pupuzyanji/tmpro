import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PlatformAdminAuthController, TenantsAdminController, OrgSignupsAdminController } from './platform-admin.controller';
import { PlatformAdminAuthService } from './platform-admin-auth.service';
import { PlatformAdminJwtStrategy } from './platform-admin-jwt.strategy';
import { TenantsAdminService } from './tenants-admin.service';
import { OrgSignupsAdminService } from './org-signups-admin.service';

@Module({
  imports: [
    PassportModule,
    // Same secret/expiry as AuthModule's JwtModule — the two are kept apart
    // by the `scope: 'platform'` claim (see PlatformAdminJwtStrategy),
    // not by using different keys.
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-only-change-me',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [PlatformAdminAuthController, TenantsAdminController, OrgSignupsAdminController],
  providers: [PlatformAdminAuthService, PlatformAdminJwtStrategy, TenantsAdminService, OrgSignupsAdminService],
})
export class PlatformAdminModule {}
