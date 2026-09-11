import { getChatGPTUser } from '@/app/chatgpt-auth';
import { stripe } from '@/lib/server/billing';
import { db, sameOrigin, setting } from '@/lib/server/database';
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  try {
    const sub = await db()
      .prepare(
        'SELECT customer_id FROM subscriptions WHERE user_id=? ORDER BY updated_at DESC LIMIT 1',
      )
      .bind(user.userId)
      .first<{ customer_id: string }>();
    if (!sub)
      return Response.json(
        { error: 'No subscription found.' },
        { status: 404 },
      );
    const session = await stripe().billingPortal.sessions.create({
      customer: sub.customer_id,
      return_url: setting('APP_ORIGIN') + '/?settings=1',
    });
    return Response.json({ url: session.url });
  } catch {
    return Response.json(
      { error: 'Billing management is temporarily unavailable.' },
      { status: 503 },
    );
  }
}
