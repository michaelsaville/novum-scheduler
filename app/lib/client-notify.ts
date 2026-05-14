/**
 * Client-facing notification helpers. Each function is fire-and-forget
 * from the calling server action: short-circuits silently when the
 * project hasn't opted in, never throws.
 *
 * Triggers wired:
 *   - notifyTaskCompleted(taskId): from setTaskStatus when status → done.
 *   - notifyDeficiencyResolved(deficiencyId): from resolveDeficiency.
 *
 * NOT fired: task moves, day-shifts, comment posts — too noisy for a
 * client-facing channel. Operator-side push covers internal flow.
 */

import { prisma } from './prisma';
import { sendMail } from './email';

function portalLink(token: string | null): string | null {
  if (!token) return null;
  const origin = process.env.PUBLIC_ORIGIN ?? 'https://novum.pcc2k.com';
  return `${origin}/p/${token}`;
}

function safeProjectLabel(p: { name: string; clientName: string | null }) {
  return p.clientName ? `${p.name} · ${p.clientName}` : p.name;
}

export async function notifyTaskCompleted(taskId: string): Promise<void> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        title: true,
        project: {
          select: {
            name: true,
            clientName: true,
            clientEmail: true,
            notifyClient: true,
            clientPortalToken: true,
          },
        },
      },
    });
    if (!task) return;
    if (!task.project.notifyClient || !task.project.clientEmail) return;

    const link = portalLink(task.project.clientPortalToken);
    const label = safeProjectLabel(task.project);
    const subject = `[${task.project.name}] Task complete: ${task.title}`;
    const text =
      `Hi,\n\n` +
      `A task on ${label} has been marked complete:\n\n` +
      `• ${task.title}\n\n` +
      (link ? `View progress: ${link}\n\n` : '') +
      `— Novum Designs`;
    await sendMail({ to: task.project.clientEmail, subject, text });
  } catch (e) {
    console.error('[client-notify] task.completed failed', { taskId, error: e });
  }
}

export async function notifyDeficiencyResolved(deficiencyId: string): Promise<void> {
  try {
    const def = await prisma.deficiency.findUnique({
      where: { id: deficiencyId },
      select: {
        description: true,
        task: {
          select: {
            title: true,
            project: {
              select: {
                name: true,
                clientName: true,
                clientEmail: true,
                notifyClient: true,
                clientPortalToken: true,
              },
            },
          },
        },
      },
    });
    if (!def) return;
    if (!def.task.project.notifyClient || !def.task.project.clientEmail) return;

    const link = portalLink(def.task.project.clientPortalToken);
    const label = safeProjectLabel(def.task.project);
    const subject = `[${def.task.project.name}] Issue resolved`;
    const text =
      `Hi,\n\n` +
      `An open issue on ${label} has been resolved:\n\n` +
      `Task: ${def.task.title}\n` +
      `Issue: ${def.description}\n\n` +
      (link ? `View progress: ${link}\n\n` : '') +
      `— Novum Designs`;
    await sendMail({ to: def.task.project.clientEmail, subject, text });
  } catch (e) {
    console.error('[client-notify] deficiency.resolved failed', { deficiencyId, error: e });
  }
}
