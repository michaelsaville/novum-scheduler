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
