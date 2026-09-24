# tmPro billing — Stripe setup (v025.A)

Billing is off until `STRIPE_SECRET_KEY` is set. Do everything below in Stripe **test
mode** first, run through a sign-up with a test card, then repeat with live keys.

## 1. Stripe account
1. Create a Stripe account for Riverbird Technology NZ at https://dashboard.stripe.com
   and complete business verification + your NZ bank account for payouts.
2. **Adaptive Pricing** (customers pay in their local currency, you receive USD):
   Settings → Payments → Adaptive Pricing → turn on. It requires USD to be one of your
   settlement currencies — check Settings → Payouts; if USD isn't listed, add a USD
   bank account (e.g. a Wise USD account) or Stripe will only charge in USD.
3. **Failed payments:** Settings → Billing → Subscriptions and emails →
   - Smart Retries: on (e.g. up to 4 retries within 2 weeks)
   - "If all retries fail": **cancel the subscription** (tmPro then deactivates the
     tenant; its data is kept and you can reactivate it from Platform Admin)
   - Customer emails: failed payment + expiring card: on

## 2. Keys and products (on the server)
```bash
cd /opt/tmpro/app/apps/api
nano .env        # add:
#   STRIPE_SECRET_KEY="sk_test_…"            (Developers → API keys)
#   BILLING_TRIAL_DAYS=7
npm run billing:setup
```
The script prints a `STRIPE_PORTAL_CONFIGURATION="bpc_…"` line — add it to `.env` too.

## 3. Webhook
Stripe Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://tmpro.bitware.app/api/billing/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.payment_failed`
- Copy the signing secret into `.env` as `STRIPE_WEBHOOK_SECRET="whsec_…"`

Then `pm2 restart tmpro-api --update-env`.

## 4. Test it (test mode)
1. Open `https://tmpro.bitware.app/pricing`, pick a plan, fill in the form.
2. On Stripe Checkout use card `4242 4242 4242 4242`, any future date, any CVC.
3. You land on "You're all set" → sign in with the email/password you chose.
4. Settings → Billing: try an upgrade, open "Manage payment & invoices".
5. Failed-payment test: Stripe test card `4000 0000 0000 0341` (attaches, then fails
   on charge) or use Stripe's test clock to end the trial.
6. Platform Admin shows the tenant with its plan, status and MRR.

## 5. Go live
Swap in `sk_live_…`, re-run `npm run billing:setup` (live mode has its own products),
create the live webhook endpoint and its `whsec_…`, restart. Publish terms of service
and a refund/cancellation policy on your site — the sign-up form asks customers to
agree to your terms.

## Changing prices
Edit `apps/api/src/common/billing/plans.ts` **and** `apps/web/src/lib/billing-plans.ts`,
deploy, run `npm run billing:setup`. New sign-ups get the new price; existing
subscribers keep theirs until they change plan.
