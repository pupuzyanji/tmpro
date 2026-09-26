// v025.A — one-off (and safely re-runnable) Stripe setup for tmPro billing.
//
//   npm run billing:setup
//
// Creates, in whichever Stripe account STRIPE_SECRET_KEY points at (test or
// live), everything tmPro's billing code expects to find:
//   - 3 Products (tmPro Core / Growth / Pro)
//   - 12 monthly USD Prices, one per plan x size band, each with the lookup
//     key BillingService uses to find it (e.g. "tmpro_growth_b50")
//   - a Customer Portal configuration (update card, invoices, cancel at
//     period end), printed so you can put it in STRIPE_PORTAL_CONFIGURATION
//
// Prices come from common/billing/plans.ts. Changing a price there and
// re-running creates a new Stripe Price and moves the lookup key onto it
// (Stripe prices are immutable) — existing subscribers stay on their old
// price until they change plan, which is standard SaaS practice.
import 'dotenv/config';
import { getStripe } from '../common/billing/stripe.client';
import { BANDS, BAND_KEYS, BILLING_CURRENCY, PLANS, PLAN_KEYS, PRICES_USD, lookupKey } from '../common/billing/plans';

async function main() {
  const stripe = getStripe();
  // sk_live_… (full access) and rk_live_… (restricted) are both live-mode keys.
  const mode = /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? '') ? 'LIVE' : 'TEST';
  console.log(`Setting up tmPro billing in Stripe (${mode} mode)…\n`);

  const existingProducts = (await stripe.products.list({ limit: 100, active: true })).data;

  for (const plan of PLAN_KEYS) {
    let product = existingProducts.find((p) => p.metadata?.tmpro_plan === plan);
    if (!product) {
      product = await stripe.products.create({
        name: `tmPro ${PLANS[plan].name}`,
        description: `${PLANS[plan].tagline}. Includes: ${PLANS[plan].modules.join(', ')}.`,
        metadata: { tmpro_plan: plan },
      });
      console.log(`+ product  ${product.name} (${product.id})`);
    } else {
      console.log(`= product  ${product.name} (${product.id})`);
    }

    for (const band of BAND_KEYS) {
      const key = lookupKey(plan, band);
      const cents = PRICES_USD[plan][band] * 100;
      const [current] = (await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 })).data;
      if (current && current.unit_amount === cents && current.currency === BILLING_CURRENCY && current.product === product.id) {
        console.log(`  = ${key.padEnd(18)} $${PRICES_USD[plan][band]}/mo (${current.id})`);
        continue;
      }
      const price = await stripe.prices.create({
        product: product.id,
        currency: BILLING_CURRENCY,
        unit_amount: cents,
        recurring: { interval: 'month' },
        nickname: `${PLANS[plan].name} — ${BANDS[band].label}`,
        lookup_key: key,
        transfer_lookup_key: true,
        metadata: { tmpro_plan: plan, tmpro_band: band },
      });
      console.log(`  + ${key.padEnd(18)} $${PRICES_USD[plan][band]}/mo (${price.id})`);
    }
  }

  const portal = await stripe.billingPortal.configurations.create({
    business_profile: { headline: 'Manage your tmPro subscription' },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name', 'tax_id'] },
      subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] } },
    },
  });
  console.log(`\nCustomer Portal configuration: ${portal.id}`);
  console.log(`Add to apps/api/.env:  STRIPE_PORTAL_CONFIGURATION="${portal.id}"`);
  console.log('\nDone. Plan and band changes happen inside tmPro (Settings → Billing), not in the portal.');
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
