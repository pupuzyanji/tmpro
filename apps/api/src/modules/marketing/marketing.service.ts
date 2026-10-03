import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, gte } from 'drizzle-orm';
import { db } from '../../db/client';
import { linkClicks, marketingEvents, orgSignupRequests, tenants, trackedLinks } from '../../db/schema';
import { Attribution, cleanAttribution, deviceOf, isBot } from './attribution';
import type { CreateLinkDto, LinkClickDto, MarketingEventDto, UpdateLinkDto } from './marketing.dto';

const tag = (v?: string | null) => {
  const t = (v ?? '').trim();
  return t.length ? t : null;
};
const slugify = (v?: string | null) => tag(v)?.toLowerCase().replace(/\s+/g, '-') ?? null;

/** v031.A — campaign tracking for tmPro's own marketing: short links,
 *  public-page funnel events, and the Sources / Links views in Platform
 *  Admin. Everything here is untenanted (plain `db`). */
@Injectable()
export class MarketingService {
  /** A short link was opened. Link previews and crawlers (WhatsApp fetches
   *  the page to build its preview card) get the destination but are not
   *  counted. */
  async click(dto: LinkClickDto) {
    const [link] = await db.select().from(trackedLinks).where(eq(trackedLinks.slug, dto.slug.toLowerCase())).limit(1);
    if (!link) throw new NotFoundException('Link not found.');
    if (link.active && !isBot(dto.userAgent)) {
      await db.insert(linkClicks).values({ linkId: link.id, device: deviceOf(dto.userAgent), country: tag(dto.country) });
    }
    const params = new URLSearchParams();
    params.set('utm_source', link.utmSource);
    if (link.utmMedium) params.set('utm_medium', link.utmMedium);
    if (link.utmCampaign) params.set('utm_campaign', link.utmCampaign);
    if (link.utmContent) params.set('utm_content', link.utmContent);
    params.set('tl', link.slug);
    const sep = link.destination.includes('?') ? '&' : '?';
    return { url: link.active ? `${link.destination}${sep}${params.toString()}` : link.destination };
  }

  async event(dto: MarketingEventDto, userAgent?: string) {
    if (isBot(userAgent)) return { ok: true };
    const a = cleanAttribution(dto.attribution);
    await db.insert(marketingEvents).values({
      type: dto.type,
      visitorId: a?.visitorId ?? null,
      path: tag(dto.path),
      detail: tag(dto.detail),
      linkSlug: a?.last.slug ?? null,
      utmSource: a?.last.source ?? 'direct',
      utmMedium: a?.last.medium ?? null,
      utmCampaign: a?.last.campaign ?? null,
      utmContent: a?.last.content ?? null,
      referrer: a?.last.referrer ?? null,
      device: deviceOf(userAgent),
    });
    return { ok: true };
  }

  // ---- Platform Admin: Links ------------------------------------------

  async listLinks() {
    const [links, clicks, events, orgs, leads] = await Promise.all([
      db.select().from(trackedLinks).orderBy(desc(trackedLinks.createdAt)),
      db.select().from(linkClicks),
      db.select({ slug: marketingEvents.linkSlug, visitorId: marketingEvents.visitorId, type: marketingEvents.type }).from(marketingEvents),
      db.select({ attribution: tenants.attribution }).from(tenants),
      db.select({ attribution: orgSignupRequests.attribution }).from(orgSignupRequests),
    ]);
    const weekAgo = Date.now() - 7 * 86_400_000;
    const regs = [...orgs, ...leads].map((r) => r.attribution as Attribution | null).filter(Boolean) as Attribution[];
    return links.map((l) => {
      const mine = clicks.filter((c) => c.linkId === l.id);
      const visitors = new Set(events.filter((e) => e.slug === l.slug && e.visitorId).map((e) => e.visitorId));
      const last = mine.reduce<Date | null>((m, c) => (!m || c.createdAt > m ? c.createdAt : m), null);
      return {
        id: l.id,
        slug: l.slug,
        destination: l.destination,
        source: l.utmSource,
        medium: l.utmMedium,
        campaign: l.utmCampaign,
        content: l.utmContent,
        active: l.active,
        createdAt: l.createdAt,
        clicks: mine.length,
        clicks7d: mine.filter((c) => c.createdAt.getTime() >= weekAgo).length,
        visitors: visitors.size,
        registrations: regs.filter((a) => a.first.slug === l.slug || a.last.slug === l.slug).length,
        lastClickAt: last,
      };
    });
  }

  async createLink(dto: CreateLinkDto) {
    const slug = dto.slug.toLowerCase();
    const [existing] = await db.select({ id: trackedLinks.id }).from(trackedLinks).where(eq(trackedLinks.slug, slug)).limit(1);
    if (existing) throw new ConflictException('That short name has already been used. Choose another.');
    const [row] = await db
      .insert(trackedLinks)
      .values({
        slug,
        destination: dto.destination.trim(),
        utmSource: slugify(dto.source) ?? 'direct',
        utmMedium: slugify(dto.medium),
        utmCampaign: slugify(dto.campaign),
        utmContent: slugify(dto.content),
      })
      .returning();
    return row;
  }

  async updateLink(id: string, dto: UpdateLinkDto) {
    const patch: Partial<typeof trackedLinks.$inferInsert> = {};
    if (dto.destination !== undefined) patch.destination = dto.destination.trim();
    if (dto.active !== undefined) patch.active = dto.active;
    if (!Object.keys(patch).length) return { ok: true };
    const [row] = await db.update(trackedLinks).set(patch).where(eq(trackedLinks.id, id)).returning();
    if (!row) throw new NotFoundException('Link not found.');
    return row;
  }

  // ---- Platform Admin: Sources ----------------------------------------

  /** One row per source / medium / campaign / content over the last `days`:
   *  visits → pricing views → plan clicks → registrations → trial → paying.
   *  Grouped by the last campaign touch before each step. */
  async sources(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [events, orgs, leads] = await Promise.all([
      db.select().from(marketingEvents).where(gte(marketingEvents.createdAt, since)),
      db.select().from(tenants).where(gte(tenants.createdAt, since)),
      db.select().from(orgSignupRequests).where(gte(orgSignupRequests.createdAt, since)),
    ]);
    type Row = {
      source: string; medium: string | null; campaign: string | null; content: string | null;
      visits: number; visitors: Set<string>; pricingViews: number; planClicks: number;
      registrations: number; trials: number; paying: number;
    };
    const rows = new Map<string, Row>();
    const row = (s: string | null, m: string | null, c: string | null, k: string | null) => {
      const key = [s ?? 'direct', m ?? '', c ?? '', k ?? ''].join('|');
      let r = rows.get(key);
      if (!r) {
        r = { source: s ?? 'direct', medium: m, campaign: c, content: k, visits: 0, visitors: new Set(), pricingViews: 0, planClicks: 0, registrations: 0, trials: 0, paying: 0 };
        rows.set(key, r);
      }
      return r;
    };
    for (const e of events) {
      const r = row(e.utmSource, e.utmMedium, e.utmCampaign, e.utmContent);
      if (e.type === 'visit') {
        r.visits += 1;
        if (e.visitorId) r.visitors.add(e.visitorId);
      } else if (e.type === 'pricing_view') r.pricingViews += 1;
      else if (e.type === 'plan_click') r.planClicks += 1;
    }
    for (const l of leads) {
      const a = l.attribution as Attribution | null;
      if (a) row(a.last.source, a.last.medium, a.last.campaign, a.last.content).registrations += 1;
    }
    for (const t of orgs) {
      const a = t.attribution as Attribution | null;
      if (!a) continue; // created by hand in Platform Admin
      const r = row(a.last.source, a.last.medium, a.last.campaign, a.last.content);
      r.registrations += 1;
      if (t.billingStatus === 'TRIALING') r.trials += 1;
      if (t.billingStatus === 'ACTIVE' || t.billingStatus === 'PAST_DUE') r.paying += 1;
    }
    return {
      days,
      rows: [...rows.values()]
        .map((r) => ({ ...r, visitors: r.visitors.size }))
        .sort((a, b) => b.registrations - a.registrations || b.visits - a.visits),
    };
  }
}
