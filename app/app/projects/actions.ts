'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export type ProjectFormState = {
  ok: boolean;
  error: string | null;
};

const initial: ProjectFormState = { ok: false, error: null };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const STATUSES = ['active', 'on_hold', 'done'] as const;
type Status = (typeof STATUSES)[number];
function isStatus(s: string): s is Status {
  return (STATUSES as readonly string[]).includes(s);
}

async function requireSchedulerOrAdmin() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== 'admin' && role !== 'scheduler') return null;
  return session;
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  if (!(await requireSchedulerOrAdmin())) {
    return { ok: false, error: 'Forbidden' };
  }

  const name = String(formData.get('name') ?? '').trim();
  const clientName = String(formData.get('clientName') ?? '').trim() || null;
  const colorRaw = String(formData.get('color') ?? '').trim();
  const color = colorRaw === '' ? null : colorRaw;

  if (name.length < 1 || name.length > 120) {
    return { ok: false, error: 'Project name is required (max 120 chars).' };
  }
  if (clientName && clientName.length > 120) {
    return { ok: false, error: 'Client name max 120 chars.' };
  }
  if (color !== null && !HEX_COLOR.test(color)) {
    return { ok: false, error: 'Color must be a 6-digit hex like #2563eb.' };
  }

  const created = await prisma.project.create({
    data: { name, clientName, color, status: 'active' },
  });

  revalidatePath('/projects');
  redirect(`/projects/${created.id}`);
}

export async function updateProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  if (!(await requireSchedulerOrAdmin())) {
    return { ok: false, error: 'Forbidden' };
  }

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const clientName = String(formData.get('clientName') ?? '').trim() || null;
  const colorRaw = String(formData.get('color') ?? '').trim();
  const color = colorRaw === '' ? null : colorRaw;
  const status = String(formData.get('status') ?? '').trim();

  if (!id) return { ok: false, error: 'Missing project id.' };
  if (name.length < 1 || name.length > 120) {
    return { ok: false, error: 'Project name is required (max 120 chars).' };
  }
  if (clientName && clientName.length > 120) {
    return { ok: false, error: 'Client name max 120 chars.' };
  }
  if (color !== null && !HEX_COLOR.test(color)) {
    return { ok: false, error: 'Color must be a 6-digit hex like #2563eb.' };
  }
  if (!isStatus(status)) return { ok: false, error: 'Invalid status.' };

  await prisma.project.update({
    where: { id },
    data: { name, clientName, color, status },
  });

  revalidatePath('/projects');
  revalidatePath(`/projects/${id}`);
  return { ok: true, error: null };
}

export async function archiveProject(formData: FormData) {
  if (!(await requireSchedulerOrAdmin())) {
    return;
  }
  const id = String(formData.get('id') ?? '');
  const archive = formData.get('archive') === 'true';
  if (!id) return;

  await prisma.project.update({
    where: { id },
    data: { archivedAt: archive ? new Date() : null },
  });
  revalidatePath('/projects');
  revalidatePath(`/projects/${id}`);
}
