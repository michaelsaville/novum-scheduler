import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { csvResponse } from '@/lib/csv';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  if (session.user.role === 'installer') {
    return new Response('Forbidden', { status: 403 });
  }

  const open = await prisma.deficiency.findMany({
    where: { status: 'open' },
    orderBy: [{ dueBy: 'asc' }, { createdAt: 'asc' }],
    include: {
      task: {
        select: {
          title: true,
          project: { select: { name: true, clientName: true } },
        },
      },
      raisedBy: { select: { name: true } },
    },
  });

  const now = Date.now();
  const rows = open.map((d) => {
    const ageDays = Math.floor((now - d.createdAt.getTime()) / (24 * 60 * 60 * 1000));
    const overdue = d.dueBy ? d.dueBy.getTime() < now : false;
    return [
      d.severity,
      d.task.project.name,
      d.task.project.clientName ?? '',
      d.task.title,
      d.description,
      d.raisedBy.name,
      d.dueBy ? d.dueBy.toISOString().slice(0, 10) : '',
      overdue ? 'overdue' : '',
      ageDays,
    ];
  });

  return csvResponse(
    'open-deficiencies.csv',
    [
      'severity',
      'project',
      'client',
      'task',
      'description',
      'raisedBy',
      'dueBy',
      'flag',
      'ageDays',
    ],
    rows,
  );
}
