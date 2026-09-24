import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db, withTenant } from '../../db/client';
import { billingEvents, orgSignupRequests, tenants, users } from '../../db/schema';
import { MailService } from '../../common/mail/mail.service';
import { countSeatsUsed } from '../../common/seats/seat-policy';
import { CORE_MODULE_KEYS } from '../../common/modules/module-catalog';
import {
  BANDS,
  PLANS,
  PRICES_USD,
  bandForHeadcount,
  isBandKey,
  isPlanKey,
  lookupKey,
  monthlyPriceUsd,
  nextBand,
  parseLookupKey,
  publicCatalogue,
  trialDays,
  type BandKey,
  type PlanKey,
} from '../../common/billing/plans';
import { getStripe, stripeConfigured, webAppUrl } from '../../common/billing/stripe.client';
import { TenantsAdminService } from '../../platform-admin/tenants-admin.service';
import type { ChangePlanDto, SelfServeSignupDto } from './dto/billing.dto';

type TenantRow = typeof tenants.$inferSelect;

// Same inbox OrgSignupService notifies about "Contact us" leads.
const NOTIFY_EMAIL = 'us@bitware.app';
const FX_TTL_MS = 12 * 60 * 60 * 1000;

/** Stripe subscription status → tenants.billingStatus + whether the tenant
 *  can sign in. PAST_DUE keeps access (Stripe is still retrying the card,
 *  and the app shows a "payment failed" banner); once Stripe gives up and
 *  cancels (or marks unpaid), access stops. */
function mapStatus(s: Stripe.Subscription.Status): { billingStatus: string; active: boolean } {
  switch (s) {
    case 'trialing':
      return { billingStatus: 'TRIALING', active: true };
    case 'active':
      return { billingStatus: 'ACTIVE', active: true };
    case 'past_due':
      return { billingStatus: 'PAST_DUE', active: true };
    case 'unpaid':
      return { billingStatus: 'UNPAID', active: false };
    case 'canceled':
    case 'incomplete_expired':
      return { billingStatus: 'CANCELED', active: false };
    case 'paused':
      return { billingStatus: 'PAUSED', active: false };
    default:
      return { billingStatus: 'INCOMPLETE', active: false };
  }
}

function toDate(unix: number | null | undefined): Date | null {
  return unix ? new Date(unix * 1000) : null;
}

/** From API version 2025-03-31 ("basil") the billing period lives on each
 *  subscription item rather than the subscription itself — read whichever
 *  is present so this works across API versions. */
function periodEnd(sub: Stripe.Subscription): Date | null {
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  return toDate(legacy ?? item?.current_period_end);
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private priceIdCache = new Map<string, string>();
  private fxCache: { at: number; body: { base: string; rates: Record<string, number> | null; updatedAt: string | null } } | null =
    null;

  constructor(
    private tenantsAdmin: TenantsAdminService,
    private mail: MailService,
  ) {}

  // ---------------------------------------------------------------- public

  catalogue() {
    return { ...publicCatalogue(), selfServeEnabled: stripeConfigured() };
  }

  /** USD → every currency, for the pricing page's "≈ local price" line.
   *  Display only — what the customer is actually charged is decided by
   *  Stripe Checkout (Adaptive Pricing), which uses its own rate. Cached so
   *  a busy pricing page makes at most two upstream calls a day; if the
   *  rate feed is unreachable the page just shows USD. */
  async fx() {
    if (this.fxCache && Date.now() - this.fxCache.at < FX_TTL_MS) return this.fxCache.body;
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
      if (json.result !== 'success' || !json.rates) throw new Error('unexpected response');
      this.fxCache = { at: Date.now(), body: { base: 'USD', rates: json.rates, updatedAt: json.time_last_update_utc ?? null } };
    } catch (err) {
      this.logger.warn(`FX rates unavailable: ${(err as Error).message}`);
      // Keep serving a stale copy if we have one; otherwise USD-only.
      if (!this.fxCache) return { base: 'USD', rates: null, updatedAt: null };
    }
    return this.fxCache!.body;
  }

  /** Self-serve sign-up: tenant (INACTIVE until paid) + Admin login +
   *  Stripe customer + Checkout Session. The tenant only becomes usable
   *  once Checkout completes — see finalizeCheckout(). */
  async signup(dto: SelfServeSignupDto) {
    const stripe = getStripe();
    const email = dto.email.trim().toLowerCase();

    // Someone who abandoned Checkout and is trying again: clear out their
    // earlier, never-paid tenant rather than leaving duplicates behind.
    await db
      .delete(tenants)
      .where(and(eq(tenants.billingEmail, email), eq(tenants.billingStatus, 'INCOMPLETE'), eq(tenants.status, 'INACTIVE')));

    const created = await this.tenantsAdmin.create({
      organisationName: dto.organisationName,
      adminFirstName: dto.firstName,
      adminLastName: dto.lastName,
      adminEmail: email,
      password: dto.password,
      enabledModules: PLANS[dto.plan].modules,
      seatCap: BANDS[dto.band].max,
    });

    try {
      const customer = await stripe.customers.create({
        email,
        name: dto.organisationName.trim(),
        phone: dto.phone.trim(),
        metadata: { tenantId: created.id, tenantSlug: created.slug, country: dto.country },
      });

      await db
        .update(tenants)
        .set({
          plan: dto.plan,
          band: dto.band,
          billingStatus: 'INCOMPLETE',
          billingEmail: email,
          country: dto.country.trim(),
          stripeCustomerId: customer.id,
        })
        .where(eq(tenants.id, created.id));

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customer.id,
        client_reference_id: created.id,
        line_items: [{ price: await this.priceId(dto.plan, dto.band), quantity: 1 }],
        payment_method_collection: 'always',
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        subscription_data: {
          ...(trialDays() > 0 ? { trial_period_days: trialDays() } : {}),
          metadata: { tenantId: created.id, plan: dto.plan, band: dto.band },
        },
        metadata: { tenantId: created.id, plan: dto.plan, band: dto.band },
        success_url: `${webAppUrl()}/register-organisation/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${webAppUrl()}/pricing?cancelled=1`,
      });

      if (!session.url) throw new Error('Stripe did not return a Checkout URL.');
      return { checkoutUrl: session.url };
    } catch (err) {
      // Nothing billable happened — don't leave a half-made tenant behind.
      await db.delete(tenants).where(eq(tenants.id, created.id));
      this.logger.error(`Self-serve sign-up failed for ${email}: ${(err as Error).message}`);
      throw err instanceof BadRequestException
        ? err
        : new BadRequestException('We could not start checkout just now. Please try again in a moment.');
    }
  }

  /** Polled by /register-organisation/success. Also finalizes the tenant if
   *  the Checkout webhook hasn't landed yet (or webhooks aren't wired up),
   *  so the customer never waits on webhook delivery to sign in. */
  async checkoutStatus(sessionId: string) {
    if (!sessionId?.startsWith('cs_')) throw new BadRequestException('Unknown checkout session.');
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.status === 'complete') await this.finalizeCheckout(session);
    const tenantId = session.client_reference_id ?? session.metadata?.tenantId;
    const [t] = tenantId ? await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1) : [];
    return {
      complete: session.status === 'complete',
      ready: t?.status === 'ACTIVE',
      organisationName: t?.name ?? null,
      email: t?.billingEmail ?? null,
      trialEndsAt: t?.trialEndsAt ?? null,
    };
  }

  // --------------------------------------------------------------- webhook

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('Webhook secret not configured.');
    if (!rawBody || !signature) throw new BadRequestException('Missing webhook payload or signature.');

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed: ${(err as Error).message}`);
    }

    // Idempotency — Stripe retries deliveries, so apply each event once.
    const inserted = await db
      .insert(billingEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: billingEvents.id });
    if (inserted.length === 0) return { received: true, duplicate: true };

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.finalizeCheckout(event.data.object as Stripe.Checkout.Session);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.syncSubscription(event.data.object as Stripe.Subscription);
          break;
        case 'invoice.payment_failed':
          await this.onPaymentFailed(event.data.object as Stripe.Invoice);
          break;
        default:
          break;
      }
    } catch (err) {
      // Let Stripe retry: forget we "processed" it.
      await db.delete(billingEvents).where(eq(billingEvents.id, event.id));
      throw err;
    }
    // Housekeeping: event ids only need remembering for Stripe's retry window.
    await db.delete(billingEvents).where(lt(billingEvents.receivedAt, new Date(Date.now() - 30 * 86_400_000)));
    return { received: true };
  }

  /** Checkout finished: attach the subscription and switch the tenant on.
   *  Safe to call more than once (webhook + success-page poll). */
  async finalizeCheckout(session: Stripe.Checkout.Session) {
    const tenantId = session.client_reference_id ?? session.metadata?.tenantId;
    if (!tenantId) return;
    const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!t) return;

    const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (!subId) return;
    const sub = await getStripe().subscriptions.retrieve(subId);
    const firstActivation = t.status === 'INACTIVE' && t.billingStatus === 'INCOMPLETE';
    await this.applySubscription(t, sub);

    if (firstActivation) {
      const plan = isPlanKey(t.plan) ? PLANS[t.plan].name : t.plan;
      const band = isBandKey(t.band) ? BANDS[t.band].label : t.band;
      const trialEnd = toDate(sub.trial_end);
      await this.mail.send({
        to: t.billingEmail ?? '',
        subject: `Welcome to tmPro — ${t.name} is ready`,
        text: [
          `Your tmPro workspace for ${t.name} is ready.`,
          '',
          `Plan: ${plan} (${band})`,
          trialEnd ? `Free trial until ${trialEnd.toDateString()} — your card is first charged then.` : '',
          '',
          `Sign in at ${webAppUrl()}/login with ${t.billingEmail}.`,
          `Manage your plan, card and invoices any time from Settings → Billing.`,
        ]
          .filter((l) => l !== '')
          .join('\n'),
      });
      await this.mail.send({
        to: NOTIFY_EMAIL,
        subject: `New tmPro subscriber: ${t.name}`,
        text: `${t.name} (${t.billingEmail}, ${t.country ?? 'country not given'}) started a ${plan} / ${band} subscription.`,
      });
    }
  }

  /** Subscription created/updated/deleted in Stripe (including changes made
   *  in the Customer Portal) → mirror plan, band, status and dates. */
  async syncSubscription(sub: Stripe.Subscription) {
    const t = await this.tenantForSubscription(sub);
    if (!t) {
      this.logger.warn(`No tenant found for subscription ${sub.id}`);
      return;
    }
    await this.applySubscription(t, sub);
  }

  private async onPaymentFailed(invoice: Stripe.Invoice) {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;
    const [t] = await db.select().from(tenants).where(eq(tenants.stripeCustomerId, customerId)).limit(1);
    if (!t || t.billingStatus === 'MANUAL') return;
    await db.update(tenants).set({ billingStatus: 'PAST_DUE' }).where(eq(tenants.id, t.id));
    await this.mail.send({
      to: t.billingEmail ?? '',
      subject: `Action needed: your tmPro payment didn't go through`,
      text: [
        `We couldn't take this month's tmPro payment for ${t.name}.`,
        `Your workspace stays open while we retry the card over the next few days.`,
        `To avoid interruption, update your card in tmPro under Settings → Billing → Manage payment & invoices.`,
      ].join('\n'),
    });
  }

  private async tenantForSubscription(sub: Stripe.Subscription): Promise<TenantRow | null> {
    const bySub = await db.select().from(tenants).where(eq(tenants.stripeSubscriptionId, sub.id)).limit(1);
    if (bySub[0]) return bySub[0];
    const tenantId = sub.metadata?.tenantId;
    if (tenantId) {
      const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (t) return t;
    }
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (customerId) {
      const [t] = await db.select().from(tenants).where(eq(tenants.stripeCustomerId, customerId)).limit(1);
      if (t) return t;
    }
    return null;
  }

  /** The single place a Stripe subscription is written onto a tenant. */
  private async applySubscription(t: TenantRow, sub: Stripe.Subscription) {
    const { billingStatus, active } = mapStatus(sub.status);
    // Plan/band: prefer the price's lookup key (it changes when the plan is
    // changed in the Customer Portal), then the subscription metadata we
    // set, then whatever the tenant already has.
    const fromPrice = parseLookupKey(sub.items?.data?.[0]?.price?.lookup_key);
    const plan: string | null =
      fromPrice?.plan ?? (isPlanKey(sub.metadata?.plan) ? sub.metadata.plan : null) ?? t.plan;
    const band: string | null =
      fromPrice?.band ?? (isBandKey(sub.metadata?.band) ? sub.metadata.band : null) ?? t.band;

    const patch: Partial<typeof tenants.$inferInsert> = {
      stripeSubscriptionId: sub.id,
      billingStatus,
      trialEndsAt: toDate(sub.trial_end),
      currentPeriodEnd: periodEnd(sub),
      status: active ? 'ACTIVE' : 'INACTIVE',
      plan,
      band,
    };
    if (isPlanKey(plan)) patch.enabledModules = withCore(PLANS[plan].modules);
    if (isBandKey(band)) patch.seatCap = BANDS[band].max;
    await db.update(tenants).set(patch).where(eq(tenants.id, t.id));
  }

  // ------------------------------------------------------- tenant (Admin)

  async summary(tenantId: string) {
    const t = await this.tenant(tenantId);
    const seatsUsed = await countSeatsUsed(tenantId);
    const selfServe = t.billingStatus !== 'MANUAL' && !!t.stripeSubscriptionId && stripeConfigured();
    const band = isBandKey(t.band) ? t.band : null;
    return {
      organisationName: t.name,
      plan: t.plan,
      band: t.band,
      billingStatus: t.billingStatus,
      selfServe,
      monthlyPriceUsd: monthlyPriceUsd(t.plan, t.band),
      trialEndsAt: t.trialEndsAt,
      currentPeriodEnd: t.currentPeriodEnd,
      seatsUsed,
      seatCap: t.seatCap,
      // Where they'd need to be for their current headcount (null = 200+).
      recommendedBand: bandForHeadcount(seatsUsed),
      nextBand: band ? nextBand(band) : null,
      catalogue: publicCatalogue(),
    };
  }

  /** Lightweight status for the app-shell banner (trial ending, payment
   *  failed, seat limit close). Admin/HR only — other roles get nothing. */
  async banner(tenantId: string, role: string) {
    if (role !== 'ADMIN' && role !== 'HR') return { show: false };
    const t = await this.tenant(tenantId);
    if (t.billingStatus === 'MANUAL') {
      if (t.seatCap == null) return { show: false };
      const seatsUsed = await countSeatsUsed(tenantId);
      return { show: seatsUsed >= t.seatCap, billingStatus: 'MANUAL', seatsUsed, seatCap: t.seatCap, selfServe: false };
    }
    const seatsUsed = await countSeatsUsed(tenantId);
    return {
      show: true,
      billingStatus: t.billingStatus,
      trialEndsAt: t.trialEndsAt,
      seatsUsed,
      seatCap: t.seatCap,
      band: t.band,
      nextBand: isBandKey(t.band) ? nextBand(t.band) : null,
      selfServe: !!t.stripeSubscriptionId,
    };
  }

  async portal(tenantId: string) {
    const t = await this.tenant(tenantId);
    if (!t.stripeCustomerId) {
      throw new ForbiddenException('Your plan is managed directly by tmPro — contact us to make billing changes.');
    }
    const session = await getStripe().billingPortal.sessions.create({
      customer: t.stripeCustomerId,
      return_url: `${webAppUrl()}/settings/billing`,
      ...(process.env.STRIPE_PORTAL_CONFIGURATION ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION } : {}),
    });
    return { url: session.url };
  }

  /** Switch plan and/or band. Moving up takes effect now and charges the
   *  prorated difference immediately (and fails cleanly if the card is
   *  declined). Moving down also switches now — modules/seat cap follow —
   *  but with no refund; the lower price simply applies from the next
   *  invoice. A band that can't hold the current headcount is refused. */
  async changePlan(tenantId: string, dto: ChangePlanDto) {
    const t = await this.tenant(tenantId);
    if (t.billingStatus === 'MANUAL' || !t.stripeSubscriptionId) {
      throw new ForbiddenException('Your plan is managed directly by tmPro — contact us to change it.');
    }
    if (t.plan === dto.plan && t.band === dto.band) return this.summary(tenantId);

    const seatsUsed = await countSeatsUsed(tenantId);
    if (seatsUsed > BANDS[dto.band].max) {
      throw new BadRequestException(
        `You have ${seatsUsed} active employees, but the ${BANDS[dto.band].label} size holds up to ${BANDS[dto.band].max}. Choose a larger size.`,
      );
    }

    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(t.stripeSubscriptionId);
    const item = sub.items.data[0];
    if (!item) throw new BadRequestException('This subscription has no billable item to change.');
    const oldPrice = monthlyPriceUsd(t.plan, t.band) ?? 0;
    const isUpgrade = PRICES_USD[dto.plan][dto.band] > oldPrice;

    const updated = await stripe.subscriptions.update(t.stripeSubscriptionId, {
      items: [{ id: item.id, price: await this.priceId(dto.plan, dto.band) }],
      proration_behavior: isUpgrade ? 'always_invoice' : 'none',
      ...(isUpgrade ? { payment_behavior: 'error_if_incomplete' as const } : {}),
      metadata: { ...(sub.metadata ?? {}), tenantId, plan: dto.plan, band: dto.band },
    });

    // Apply straight away rather than waiting for the webhook, so the
    // Admin sees the new modules/seat cap as soon as the request returns.
    await this.applySubscription({ ...t }, { ...updated, metadata: { ...updated.metadata, plan: dto.plan, band: dto.band } });
    await db
      .update(tenants)
      .set({ plan: dto.plan, band: dto.band, enabledModules: withCore(PLANS[dto.plan].modules), seatCap: BANDS[dto.band].max })
      .where(eq(tenants.id, tenantId));
    const [fresh] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return { ...(await this.summary(tenantId)), enabledModules: fresh.enabledModules };
  }

  /** 200+ "Contact us" from inside the app (Settings → Billing) — recorded
   *  as a lead in Platform Admin > Pending Applications like the public form. */
  async contactSales(tenantId: string, userId: string) {
    const t = await this.tenant(tenantId);
    const requesterEmail = await withTenant(tenantId, async (tx) => {
      const [u] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      return u?.email ?? t.billingEmail ?? 'unknown';
    });
    const seatsUsed = await countSeatsUsed(tenantId);
    await db.insert(orgSignupRequests).values({
      name: requesterEmail,
      email: requesterEmail,
      organisationName: t.name,
      country: t.country ?? 'Unknown',
      staffComplement: Math.max(seatsUsed, 201),
      featuresNeeded: t.enabledModules,
    });
    await this.mail.send({
      to: NOTIFY_EMAIL,
      subject: `200+ enquiry from existing tenant ${t.name}`,
      text: `${requesterEmail} at ${t.name} (currently ${t.plan ?? 'manual'} / ${t.band ?? '-'}, ${seatsUsed} employees) asked about the 200+ tier.`,
    });
    return { ok: true };
  }

  // --------------------------------------------------------------- helpers

  private async tenant(id: string): Promise<TenantRow> {
    const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!t) throw new NotFoundException('Organisation not found.');
    return t;
  }

  /** Stripe Price id for a (plan, band), found by lookup key. Created by
   *  `npm run billing:setup`. */
  private async priceId(plan: PlanKey, band: BandKey): Promise<string> {
    const key = lookupKey(plan, band);
    const cached = this.priceIdCache.get(key);
    if (cached) return cached;
    const list = await getStripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
    const price = list.data[0];
    if (!price) {
      throw new BadRequestException(`Pricing isn't set up in Stripe yet (missing price "${key}"). Run npm run billing:setup.`);
    }
    this.priceIdCache.set(key, price.id);
    return price.id;
  }
}

function withCore(modules: readonly string[]): string[] {
  return [...new Set([...CORE_MODULE_KEYS, ...modules])];
}
