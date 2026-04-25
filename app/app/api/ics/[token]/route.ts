import { prisma } from '@/lib/prisma';
import { buildIcs } from '@/lib/ics';

export const runtime = 'nodejs';

// Public route — auth happens via the per-user `icsToken` in the path.
// Middleware excludes /api/ics from the auth matcher (see middleware.ts).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16 || token.length > 128) {
    return new Response('Bad token', { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { icsToken: token },
    select: { id: true, name: true, active: true },
  });
  if (!user || !user.active) {
    return new Response('Not found', { status: 404 });
  }

  // Pull the next ~6 weeks of scheduled tasks for this user, plus any
  // older non-done tasks (so a forgotten in-progress task still shows).
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + 42);

  const tasks = await prisma.task.findMany({
    where: {
      assignedInstallerId: user.id,
      scheduledDate: { not: null, lte: horizon },
    },
    orderBy: [{ scheduledDate: 'asc' }, { scheduledOrder: 'asc' }],
    include: { project: { select: { name: true, clientName: true } } },
  });

  const origin = process.env.PUBLIC_ORIGIN ?? 'https://novum.pcc2k.com';
  const ics = buildIcs({
    installerName: user.name,
    origin,
    tasks: tasks
      .filter((t) => t.scheduledDate !== null)
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        scheduledDateISO: new Date(t.scheduledDate!).toISOString().slice(0, 10),
        project: { name: t.project.name, clientName: t.project.clientName },
      })),
  });

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=60',
      'Content-Disposition': `inline; filename="novum-${user.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics"`,
    },
  });
}
