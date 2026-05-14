'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

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
  const session = await requireSchedulerOrAdmin();
  if (!session) {
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
  await logAudit({
    userId: session.user.id,
    action: 'project.create',
    entityType: 'project',
    entityId: created.id,
    metadata: { name, clientName },
  });

  revalidatePath('/projects');
  redirect(`/projects/${created.id}`);
}

export async function updateProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const session = await requireSchedulerOrAdmin();
  if (!session) {
    return { ok: false, error: 'Forbidden' };
  }

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const clientName = String(formData.get('clientName') ?? '').trim() || null;
  const colorRaw = String(formData.get('color') ?? '').trim();
  const color = colorRaw === '' ? null : colorRaw;
  const status = String(formData.get('status') ?? '').trim();
  const clientEmail = String(formData.get('clientEmail') ?? '').trim() || null;
  const notifyClient = formData.get('notifyClient') === 'on';

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
  // Light email validation — the SMTP path will surface real bounces.
  if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    return { ok: false, error: 'Client email looks malformed.' };
  }
  // Refuse notifyClient=true without an email — silent off would
  // mislead the operator into thinking emails will fire.
  if (notifyClient && !clientEmail) {
    return { ok: false, error: 'Set a client email before enabling notifications.' };
  }

  await prisma.project.update({
    where: { id },
    data: { name, clientName, color, status, clientEmail, notifyClient },
  });
  await logAudit({
    userId: session.user.id,
    action: 'project.update',
    entityType: 'project',
    entityId: id,
    metadata: { name, status, notifyClient },
  });

  revalidatePath('/projects');
  revalidatePath(`/projects/${id}`);
  return { ok: true, error: null };
}

/**
 * Lazy-generate a client-portal token. Idempotent: if one already
 * exists, returns the existing token. Token is a 32-char base64url
 * derived from crypto.randomUUID() shifts to keep it URL-safe.
 */
export async function generateClientPortalToken(formData: FormData) {
  const session = await requireSchedulerOrAdmin();
  if (!session) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const existing = await prisma.project.findUnique({
    where: { id },
    select: { clientPortalToken: true },
  });
  if (!existing) return;
  if (existing.clientPortalToken) {
    revalidatePath(`/projects/${id}`);
    return;
  }
  // 32-char URL-safe random token. Two crypto.randomUUIDs concatenated,
  // stripped of dashes, gives 64 hex chars; slice to 32 for a tidy URL.
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 32);
  await prisma.project.update({
    where: { id },
    data: { clientPortalToken: token },
  });
  await logAudit({
    userId: session.user.id,
    action: 'project.update',
    entityType: 'project',
    entityId: id,
    metadata: { clientPortalTokenGenerated: true },
  });
  revalidatePath(`/projects/${id}`);
}

export async function revokeClientPortalToken(formData: FormData) {
  const session = await requireSchedulerOrAdmin();
  if (!session) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await prisma.project.update({
    where: { id },
    data: { clientPortalToken: null },
  });
  await logAudit({
    userId: session.user.id,
    action: 'project.update',
    entityType: 'project',
    entityId: id,
    metadata: { clientPortalTokenRevoked: true },
  });
  revalidatePath(`/projects/${id}`);
}

export async function deleteProject(formData: FormData) {
  const session = await requireSchedulerOrAdmin();
  if (!session) return;

  const id = String(formData.get('id') ?? '');
  if (!id) return;

  // Cascade is wired in Prisma: Task.projectId onDelete: Cascade,
  // Note → Cascade from Task, NotePhoto → Cascade from Note. AuditLog
  // entityId is a plain string (no FK), so audit history survives —
  // intentional, we want the deletion itself recorded and discoverable.
  // NotePhoto rows are deleted but the JPEG files on the /uploads volume
  // are NOT cleaned up — known minor leak, follow up if disk grows.
  const existing = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { tasks: true } } },
  });
  if (!existing) return;

  await prisma.project.delete({ where: { id } });
  await logAudit({
    userId: session.user.id,
    action: 'project.delete',
    entityType: 'project',
    entityId: id,
    metadata: { name: existing.name, taskCount: existing._count.tasks },
  });

  revalidatePath('/projects');
  redirect('/projects');
}

export async function archiveProject(formData: FormData) {
  const session = await requireSchedulerOrAdmin();
  if (!session) {
    return;
  }
  const id = String(formData.get('id') ?? '');
  const archive = formData.get('archive') === 'true';
  if (!id) return;

  await prisma.project.update({
    where: { id },
    data: { archivedAt: archive ? new Date() : null },
  });
  await logAudit({
    userId: session.user.id,
    action: archive ? 'project.archive' : 'project.unarchive',
    entityType: 'project',
    entityId: id,
  });
  revalidatePath('/projects');
  revalidatePath(`/projects/${id}`);
}
