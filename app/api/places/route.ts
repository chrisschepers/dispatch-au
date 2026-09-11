import { getChatGPTUser } from '@/app/chatgpt-auth';
import { db, sameOrigin } from '@/lib/server/database';
import { entitlement } from '@/lib/server/billing';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Sign in to save places.' },
      { status: 401, headers },
    );
  try {
    const result = await db()
      .prepare(
        'SELECT id,name,lat,lng,radius FROM places WHERE user_id=? ORDER BY created_at',
      )
      .bind(user.userId)
      .all();
    return Response.json({ places: result.results }, { headers });
  } catch {
    return Response.json(
      { error: 'Saved places are temporarily unavailable.' },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Sign in to save places.' }, { status: 401 });
  try {
    const data = (await request.json()) as Record<string, unknown>;
    const { name, lat, lng, radius } = data;
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 60 ||
      typeof lat !== 'number' ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      typeof lng !== 'number' ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180 ||
      typeof radius !== 'number' ||
      !Number.isInteger(radius) ||
      radius < 1 ||
      radius > 200
    )
      return Response.json(
        { error: 'Choose a valid place and a radius from 1 to 200 km.' },
        { status: 400 },
      );
    const limit = (await entitlement(user.userId)) ? 5 : 1;
    const id = crypto.randomUUID();
    const result = await db()
      .prepare(
        'INSERT INTO places (id,user_id,name,lat,lng,radius,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM places WHERE user_id=?) < ?',
      )
      .bind(
        id,
        user.userId,
        name.trim(),
        lat,
        lng,
        radius,
        Date.now(),
        user.userId,
        limit,
      )
      .run();
    if (result.meta.changes === 0)
      return Response.json(
        {
          error:
            limit === 1
              ? 'The free plan includes one saved place. Remove it to save another.'
              : 'Your plan includes up to five saved places.',
        },
        { status: 409 },
      );
    return Response.json(
      { place: { id, name: name.trim(), lat, lng, radius } },
      { status: 201, headers },
    );
  } catch {
    return Response.json(
      { error: 'We could not save this place. Please try again.' },
      { status: 503 },
    );
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id.length > 100)
    return Response.json({ error: 'A place ID is required.' }, { status: 400 });
  try {
    await db()
      .prepare('DELETE FROM places WHERE id=? AND user_id=?')
      .bind(id, user.userId)
      .run();
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json(
      { error: 'Could not remove this place.' },
      { status: 503 },
    );
  }
}
