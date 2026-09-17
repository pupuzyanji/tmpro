import { Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { db } from '../db/client';
import { orgSignupRequests } from '../db/schema';

/** Platform Admin > Tenants > "Pending Applications" (v019.A) — read side
 *  of the public "Register your organisation" lead form (OrgSignupService
 *  handles the write side). Untenanted, same as OrgSignupService — a lead
 *  isn't a tenant yet. The platform owner reviews these here and, when
 *  ready, provisions a real tenant for one via TenantsAdminService.create()
 *  (the "Add Tenant" form on the frontend pre-fills from a pending
 *  application's name/email/organisationName/featuresNeeded when opened
 *  that way — see platform-admin/page.tsx). */
@Injectable()
export class OrgSignupsAdminService {
  async list() {
    return db.select().from(orgSignupRequests).orderBy(desc(orgSignupRequests.createdAt));
  }
}
