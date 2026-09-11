import { getChatGPTUser } from '@/app/chatgpt-auth';
import { billingReady, entitlement, stripe } from '@/lib/server/billing';
import { sameOrigin, setting } from '@/lib/server/database';
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  if (!billingReady())
    return Response.json(
      { error: 'Pro is not on sale yet. No payment has been taken.' },
      { status: 503 },
    );
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Please sign in before subscribing.' },
      { status: 401 },
    );
  try {
    const body = (await request.json()) as { plan?: string };
    if (!['monthly', 'yearly'].includes(body.plan ?? ''))
      return Response.json(
        { error: 'Choose a monthly or yearly plan.' },
        { status: 400 },
      );
    if (await entitlement(user.userId))
      return Response.json(
        {
          error: 'You already have Pro. Manage your subscription in Settings.',
        },
        { status: 409 },
      );
    const client = stripe();
    const yearly = body.plan === 'yearly';
    const price = setting(
      yearly ? 'STRIPE_PRICE_YEARLY' : 'STRIPE_PRICE_MONTHLY',
    );
    const details = await client.prices.retrieve(price);
    if (
      !details.active ||
      details.currency !== 'aud' ||
      details.unit_amount !== (yearly ? 3999 : 499) ||
      details.recurring?.interval !== (yearly ? 'year' : 'month') ||
      details.recurring.interval_count !== 1 ||
      details.tax_behavior === 'exclusive'
    )
      throw Error('Unexpected price configuration');
    const base = setting('APP_ORIGIN');
    const session = await client.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price, quantity: 1 }],
        client_reference_id: user.userId,
        customer_email: user.email,
        subscription_data: { metadata: { dispatch_user_id: user.userId } },
        success_url: `${base}/?billing=success`,
        cancel_url: `${base}/?billing=cancelled`,
        allow_promotion_codes: false,
      },
      {
        idempotencyKey: `checkout-${user.userId}-${body.plan}-${Math.floor(Date.now() / 900000)}`,
      },
    );
    return Response.json(
      { url: session.url },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      {
        error:
          'Checkout is temporarily unavailable. No subscription has been activated here.',
      },
      { status: 503 },
    );
  }
}
