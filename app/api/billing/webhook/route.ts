import Stripe from 'stripe';
import { stripe } from '@/lib/server/billing';
import { db, setting } from '@/lib/server/database';
export async function POST(request: Request) {
  const secret = setting('STRIPE_WEBHOOK_SECRET');
  if (!secret)
    return Response.json({ error: 'Not configured' }, { status: 503 });
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      await request.text(),
      request.headers.get('stripe-signature') ?? '',
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }
  if (
    ![
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ].includes(event.type)
  )
    return Response.json({ received: true });
  try {
    const database = db();
    if (
      await database
        .prepare('SELECT id FROM webhook_events WHERE id=?')
        .bind(event.id)
        .first()
    )
      return Response.json({ received: true });
    // Retrieve canonical state: an old webhook must never revive a cancelled subscription.
    const incoming = event.data.object as Stripe.Subscription;
    const current = await stripe().subscriptions.retrieve(incoming.id);
    const userId = current.metadata.dispatch_user_id;
    if (!userId) return Response.json({ received: true });
    const expected = [
      setting('STRIPE_PRICE_MONTHLY'),
      setting('STRIPE_PRICE_YEARLY'),
    ];
    const item = current.items.data.find(
      (i) => expected.includes(i.price.id) && i.price.currency === 'aud',
    );
    const status = item ? current.status : 'unsupported_price';
    const periodEnd = item?.current_period_end ?? 0;
    const customer =
      typeof current.customer === 'string'
        ? current.customer
        : current.customer.id;
    await database.batch([
      database
        .prepare(
          'INSERT INTO subscriptions (id,user_id,customer_id,status,period_end,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,period_end=excluded.period_end,updated_at=excluded.updated_at WHERE excluded.updated_at>=subscriptions.updated_at',
        )
        .bind(current.id, userId, customer, status, periodEnd, event.created),
      database
        .prepare(
          'INSERT OR IGNORE INTO webhook_events (id,received_at) VALUES (?,?)',
        )
        .bind(event.id, Date.now()),
    ]);
    return Response.json({ received: true });
  } catch {
    return Response.json(
      { error: 'Please retry this event.' },
      { status: 500 },
    );
  }
}
