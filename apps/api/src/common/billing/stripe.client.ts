import { ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';

let client: Stripe | null = null;

/** True once STRIPE_SECRET_KEY is set — self-serve sign-up and the Billing
 *  tab stay switched off (with a clear message) until then, so a fresh
 *  install without Stripe keys keeps working exactly as before v025.A. */
export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Shared Stripe SDK client. STRIPE_API_BASE is only for local testing
 * against stripe-mock (e.g. "http://localhost:12111") — leave it unset in
 * any real environment so the SDK talks to api.stripe.com.
 */
export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new ServiceUnavailableException('Online billing is not set up yet. Please contact tmPro to get started.');
  }
  const base = process.env.STRIPE_API_BASE;
  if (base) {
    const u = new URL(base);
    client = new Stripe(key, {
      host: u.hostname,
      port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)),
      protocol: u.protocol.replace(':', '') as 'http' | 'https',
    });
  } else {
    client = new Stripe(key);
  }
  return client;
}

export function webAppUrl(): string {
  return (process.env.WEB_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}
