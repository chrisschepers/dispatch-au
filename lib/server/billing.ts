import Stripe from 'stripe';
import { db, setting } from './database';
export function billingReady() {
  return (
    setting('BILLING_ENABLED') === 'true' &&
    setting('VIC_COMMERCIAL_USE_CONFIRMED') === 'true' &&
    !!setting('STRIPE_SECRET_KEY') &&
    !!setting('STRIPE_WEBHOOK_SECRET') &&
    !!setting('STRIPE_PRICE_MONTHLY') &&
    !!setting('STRIPE_PRICE_YEARLY') &&
    setting('APP_ORIGIN').startsWith('https://')
  );
}
export function stripe() {
  const key = setting('STRIPE_SECRET_KEY');
  if (!key) throw Error('Billing is not configured');
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}
export async function entitlement(userId: string) {
  return db()
    .prepare(
      "SELECT id,customer_id,status,period_end FROM subscriptions WHERE user_id=? AND status IN ('active','trialing') AND period_end>? ORDER BY period_end DESC LIMIT 1",
    )
    .bind(userId, Math.floor(Date.now() / 1000))
    .first<{
      id: string;
      customer_id: string;
      status: string;
      period_end: number;
    }>();
}
