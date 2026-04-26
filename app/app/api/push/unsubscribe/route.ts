import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }

  let body: { endpoint?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null;
  if (!endpoint) {
    return NextResponse.json({ ok: false, error: 'invalid_endpoint' }, { status: 400 });
  }

  // Only delete if it's actually this user's subscription. Avoids a malicious
  // user enumerating other people's endpoints by guessing.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
