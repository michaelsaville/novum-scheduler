'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export type TaskFormState = {
  ok: boolean;
  error: string | null;
};

const initial: TaskFormState = { ok: false, error: null };

const STATUSES = ['pending', 'in_progress', 'done', 'blocked'] as const;
type TaskStatus = (typeof STATUSES)[number];
function isStatus(s: string): s is TaskStatus {
  return (STATUSES as readonly string[]).includes(s);
}

async function requireSchedulerOrAdmin() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== 'admin' && role !== 'scheduler') return null;
  return session;
}

export async function createTask(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  if (!(await requireSchedulerOrAdmin())) {
    return { ok: false, error: 'Forbidden' };
  }

  const projectId = String(formData.get('projectId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;

  if (!projectId) return { ok: false, error: 'Missing project.' };
  if (title.length < 1 || title.length > 200) {
    return { ok: false, error: 'Title is required (max 200 chars).' };
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, error: 'Project not found.' };

  await prisma.task.create({
    data: { projectId, title, description },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, error: null };
}

export async function updateTask(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  if (!(await requireSchedulerOrAdmin())) {
    return { ok: false, error: 'Forbidden' };
  }

  const id = String(formData.get('id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const status = String(formData.get('status') ?? '').trim();

  if (!id) return { ok: false, error: 'Missing task id.' };
  if (title.length < 1 || title.length > 200) {
    return { ok: false, error: 'Title is required (max 200 chars).' };
  }
  if (!isStatus(status)) return { ok: false, error: 'Invalid status.' };

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: 'Task not found.' };

  await prisma.task.update({
    where: { id },
    data: { title, description, status },
  });

  revalidatePath(`/projects/${existing.projectId}`);
  return { ok: true, error: null };
}

export async function deleteTask(formData: FormData) {
  if (!(await requireSchedulerOrAdmin())) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.task.delete({ where: { id } });
  revalidatePath(`/projects/${existing.projectId}`);
}

// ── Notes ─────────────────────────────────────────────────────────────

export type NoteFormState = {
  ok: boolean;
  error: string | null;
};

export async function createNote(
  _prev: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Not signed in' };

  const taskId = String(formData.get('taskId') ?? '');
  const body = String(formData.get('body') ?? '').trim();

  if (!taskId) return { ok: false, error: 'Missing task.' };
  if (body.length < 1) return { ok: false, error: 'Note cannot be empty.' };
  if (body.length > 4000) return { ok: false, error: 'Note too long (max 4000 chars).' };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, assignedInstallerId: true, projectId: true },
  });
  if (!task) return { ok: false, error: 'Task not found.' };

  const role = session.user.role;
  if (role === 'installer' && task.assignedInstallerId !== session.user.id) {
    return { ok: false, error: 'Not your task.' };
  }

  await prisma.note.create({
    data: { taskId, userId: session.user.id, body },
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/me');
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true, error: null };
}

// ── Board / drag-drop scheduling ─────────────────────────────────────────

export type MoveTaskResult = { ok: boolean; error?: string };

export type MoveTaskTarget =
  | { kind: 'pool' }
  | { kind: 'column'; installerId: string; dateISO: string };

// Date is interpreted as a calendar day in UTC (yyyy-mm-dd). The board
// stores tasks by date-only; the time portion is always 00:00 UTC so
// equality checks across timezones stay deterministic.
function parseBoardDate(dateISO: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  const d = new Date(dateISO + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function moveTask(args: {
  taskId: string;
  target: MoveTaskTarget;
  // For column targets: full ordered list of task ids in the destination
  // column AFTER the move (including the moved task at its new index).
  // The action will rewrite scheduledOrder for every id in this list.
  destOrderedTaskIds?: string[];
}): Promise<MoveTaskResult> {
  if (!(await requireSchedulerOrAdmin())) {
    return { ok: false, error: 'Forbidden' };
  }

  const task = await prisma.task.findUnique({
    where: { id: args.taskId },
    select: {
      id: true,
      assignedInstallerId: true,
      scheduledDate: true,
      projectId: true,
    },
  });
  if (!task) return { ok: false, error: 'Task not found.' };

  if (args.target.kind === 'pool') {
    await prisma.task.update({
      where: { id: task.id },
      data: {
        scheduledDate: null,
        scheduledOrder: null,
        assignedInstallerId: null,
      },
    });
    revalidatePath('/board');
    revalidatePath(`/projects/${task.projectId}`);
    return { ok: true };
  }

  const { installerId, dateISO } = args.target;
  const date = parseBoardDate(dateISO);
  if (!date) return { ok: false, error: 'Invalid date.' };

  const installer = await prisma.user.findUnique({
    where: { id: installerId },
    select: { id: true, role: true, active: true },
  });
  if (!installer || !installer.active || installer.role !== 'installer') {
    return { ok: false, error: 'Installer not available.' };
  }

  const ordered = args.destOrderedTaskIds && args.destOrderedTaskIds.length > 0
    ? args.destOrderedTaskIds
    : [task.id];

  if (!ordered.includes(task.id)) ordered.push(task.id);

  // Persist: every task in `ordered` is set to (date, installerId, index).
  // Single transaction so the column ordering is consistent.
  await prisma.$transaction(
    ordered.map((id, index) =>
      prisma.task.update({
        where: { id },
        data: {
          scheduledDate: date,
          scheduledOrder: index,
          assignedInstallerId: installerId,
        },
      }),
    ),
  );

  revalidatePath('/board');
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true };
}
