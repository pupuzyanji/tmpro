import { Injectable } from '@nestjs/common';
import { db } from '../../db/client';
import { orgSignupRequests } from '../../db/schema';
import { MailService } from '../../common/mail/mail.service';
import type { CreateOrgSignupDto } from './dto/org-signup.dto';

// v023.A — every "Sign-up Here" submission is mailed here too, not just
// recorded for Platform Admin > Tenants > Pending Applications, so whoever
// is on point for new leads doesn't have to be watching that page.
const NOTIFY_EMAIL = 'us@bitware.app';

/**
 * Lead capture only — tmPro has no self-serve tenant provisioning yet, so
 * this just records the request (via the plain, untenanted `db` handle —
 * there's no tenant to scope this to) for an ops person to action manually.
 * See the `orgSignupRequests` comment in schema.ts.
 */
@Injectable()
export class OrgSignupService {
  constructor(private mail: MailService) {}

  async create(dto: CreateOrgSignupDto) {
    const [row] = await db
      .insert(orgSignupRequests)
      .values({
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone.trim(),
        organisationName: dto.organisationName.trim(),
        country: dto.country.trim(),
        staffComplement: dto.staffComplement,
        featuresNeeded: dto.featuresNeeded,
      })
      .returning();

    // Best-effort — a mail outage never blocks recording the lead itself
    // (already committed above); it just stays visible only in Platform
    // Admin's Pending Applications tab until someone notices it there.
    await this.mail.send({
      to: NOTIFY_EMAIL,
      subject: `New tmPro sign-up: ${row.organisationName}`,
      text: [
        `${row.name} (${row.email}) signed up for tmPro on behalf of ${row.organisationName}.`,
        '',
        `Phone: ${row.phone ?? '(not given)'}`,
        `Country: ${row.country}`,
        `Staff complement: ${row.staffComplement}`,
        `Features requested: ${row.featuresNeeded.length ? row.featuresNeeded.join(', ') : '(none selected)'}`,
        '',
        'Review and create their tenant from Platform Admin > Tenants > Pending Applications.',
      ].join('\n'),
    });

    return { id: row.id, status: row.status };
  }
}
