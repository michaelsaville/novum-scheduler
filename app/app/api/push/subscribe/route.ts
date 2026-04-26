import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const sub = body as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : null;
  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : null;
  const authKey = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : null;
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ ok: false, error: 'invalid_subscription' }, { status: 400 });
  }

  const userAgent = req.headers.get('user-agent')?.slice(0, 256) ?? null;

  // Re-key existing rows for this endpoint to the current user (handles the
  // case where two users share a phone — the most-recent sign-in owns the
  // endpoint until the next subscribe).
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth: authKey, userId: session.user.id, userAgent },
    update: { p256dh, auth: authKey, userId: session.user.id, userAgent },
  });

  return NextResponse.json({ ok: true });
}
