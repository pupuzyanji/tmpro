import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { sql } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { db } from '../db/client';
import { platformAdmins } from '../db/schema';
import type { PlatformAdminLoginDto } from './dto/platform-admin-login.dto';

@Injectable()
export class PlatformAdminAuthService {
  constructor(private jwt: JwtService) {}

  async login(dto: PlatformAdminLoginDto) {
    const email = dto.email.trim().toLowerCase();
    const [admin] = await db
      .select()
      .from(platformAdmins)
      .where(sql`lower(${platformAdmins.email}) = ${email}`)
      .limit(1);
    if (!admin) throw new UnauthorizedException('Invalid email or password.');

    const valid = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password.');

    // `scope: 'platform'` is what both JwtStrategy and PlatformAdminJwtStrategy
    // key off of to keep tenant and platform-admin tokens from crossing over
    // — see the comments on each.
    const accessToken = await this.jwt.signAsync({ sub: admin.id, scope: 'platform' as const });

    return {
      accessToken,
      admin: { id: admin.id, email: admin.email, name: admin.name },
    };
  }

  // Unused by any route yet — kept here as the one place a future
  // "create the first platform admin" CLI/seed step would call, rather than
  // hashing passwords ad hoc elsewhere. Not exposed over HTTP: there's no
  // self-serve platform-admin signup, deliberately (same reasoning as
  // tenant provisioning itself — see org-signup.service.ts).
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}
