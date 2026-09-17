import { Injectable } from '@nestjs/common';
import { db } from '../../db/client';
import { orgSignupRequests } from '../../db/schema';
import type { CreateOrgSignupDto } from './dto/org-signup.dto';

/**
 * Lead capture only — tmPro has no self-serve tenant provisioning yet, so
 * this just records the request (via the plain, untenanted `db` handle —
 * there's no tenant to scope this to) for an ops person to action manually.
 * See the `orgSignupRequests` comment in schema.ts.
 */
@Injectable()
export class OrgSignupService {
  async create(dto: CreateOrgSignupDto) {
    const [row] = await db
      .insert(orgSignupRequests)
      .values({
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        organisationName: dto.organisationName.trim(),
        country: dto.country.trim(),
        staffComplement: dto.staffComplement,
        featuresNeeded: dto.featuresNeeded,
      })
      .returning();
    return { id: row.id, status: row.status };
  }
}
