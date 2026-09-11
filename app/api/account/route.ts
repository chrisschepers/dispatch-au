import { getChatGPTUser } from '@/app/chatgpt-auth';
import { billingReady, entitlement } from '@/lib/server/billing';
export async function GET() {
  try {
    const user = await getChatGPTUser();
    const sub = user ? await entitlement(user.userId) : null;
    return Response.json(
      {
        user: user
          ? { name: user.fullName ?? user.email, email: user.email }
          : null,
        pro: !!sub,
        billingReady: billingReady(),
        renewsAt: sub?.period_end ?? null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'Account details are temporarily unavailable.' },
      { status: 503 },
    );
  }
}
