import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { csvResponse } from '@/lib/csv';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  if (session.user.role === 'installer') {
    return new Response('Forbidden', { status: 403 });
  }
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId') ?? '';
  if (!projectId) return new Response('Missing projectId', { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, clientName: true },
  });
  if (!project) return new Response('Not found', { status: 404 });

  const tasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: [{ status: 'asc' }, { scheduledDate: 'asc' }],
    include: {
      installer: { select: { name: true } },
      _count: { select: { notes: true } },
      timeEntries: { select: { startedAt: true, stoppedAt: true } },
    },
  });

  const rows = tasks.map((t) => {
    const actualMs = t.timeEntries.reduce(
      (sum, e) =>
        sum + (e.stoppedAt ? e.stoppedAt.getTime() - e.startedAt.getTime() : 0),
      0,
    );
    return [
      t.title,
      t.status,
      t.scheduledDate ? t.scheduledDate.toISOString().slice(0, 10) : '',
      t.installer?.name ?? '',
      t.estimatedMinutes ?? '',
      Math.round(actualMs / 60000),
      t._count.notes,
    ];
  });

  return csvResponse(
    `project-${project.name}.csv`,
    [
      'task',
      'status',
      'scheduledDate',
      'installer',
      'estimatedMinutes',
      'actualMinutes',
      'noteCount',
    ],
    rows,
  );
}
