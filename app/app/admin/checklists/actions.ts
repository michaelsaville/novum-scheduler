'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export type ChecklistResult = { ok: boolean; error: string | null };

const initial: ChecklistResult = { ok: false, error: null };

export type ChecklistTemplateItem = {
  id: string;
  label: string;
  required: boolean;
};

export type TaskChecklistItem = ChecklistTemplateItem & {
  checkedAt?: string | null;
  checkedById?: string | null;
};

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== 'admin') return null;
  return session;
}

/**
 * Create a checklist template from a free-text body — one item per
 * non-blank line. Sprint 5 cut: every item is required by default.
 * The template-edit UI for marking some items optional lives in P1.
 */
export async function createChecklistTemplate(
  _prev: ChecklistResult,
  formData: FormData,
): Promise<ChecklistResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: 'Admin only' };

  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const itemsRaw = String(formData.get('items') ?? '').trim();

  if (!name) return { ok: false, error: 'Name is required.' };
  if (!itemsRaw) return { ok: false, error: 'At least one item is required.' };

  const items: ChecklistTemplateItem[] = itemsRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label) => ({
      id: randomUUID(),
      label,
      required: true,
    }));

  if (items.length === 0) {
    return { ok: false, error: 'At least one item is required.' };
  }

  try {
    const created = await prisma.checklistTemplate.create({
      data: {
        name,
        description,
        items: items as unknown as object[],
      },
    });
    await logAudit({
      userId: session.user.id,
      action: 'checklist.template_create',
      entityType: 'task',
      entityId: created.id, // template id; entityType is best-fit since AuditLog has no 'checklist'
      metadata: { name, itemCount: items.length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg.includes('Unique')) {
      return { ok: false, error: `Template "${name}" already exists.` };
    }
    return { ok: false, error: 'Failed to save template.' };
  }

  revalidatePath('/admin/checklists');
  return { ok: true, error: null };
}

export async function deleteChecklistTemplate(formData: FormData) {
  const session = await requireAdmin();
  if (!session) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  // TaskChecklist instances reference the template; setting active=false
  // is the safe path. Hard-delete only if no instances exist.
  const inUse = await prisma.taskChecklist.count({ where: { templateId: id } });
  if (inUse > 0) {
    await prisma.checklistTemplate.update({
      where: { id },
      data: { active: false },
    });
  } else {
    await prisma.checklistTemplate.delete({ where: { id } });
  }
  await logAudit({
    userId: session.user.id,
    action: 'checklist.template_delete',
    entityType: 'task',
    entityId: id,
    metadata: { hadInstances: inUse > 0 },
  });
  revalidatePath('/admin/checklists');
}

/**
 * Apply a template to a task. Refuses if the task already has a
 * checklist — to swap, the operator clears it first (deferred — keep
 * the surface simple at v1).
 */
export async function applyChecklistToTask(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const taskId = String(formData.get('taskId') ?? '');
  const templateId = String(formData.get('templateId') ?? '');
  if (!taskId || !templateId) return;

  const role = session.user.role;
  // Schedulers and admins can apply; not installers (it's a setup action).
  if (role !== 'admin' && role !== 'scheduler') return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, checklist: { select: { id: true } } },
  });
  if (!task || task.checklist) return;

  const tpl = await prisma.checklistTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, active: true, items: true },
  });
  if (!tpl || !tpl.active) return;

  const snapshotItems: TaskChecklistItem[] = (
    tpl.items as unknown as ChecklistTemplateItem[]
  ).map((it) => ({
    id: it.id,
    label: it.label,
    required: it.required,
    checkedAt: null,
    checkedById: null,
  }));

  await prisma.taskChecklist.create({
    data: {
      taskId,
      templateId,
      items: snapshotItems as unknown as object[],
    },
  });
  await logAudit({
    userId: session.user.id,
    action: 'checklist.apply',
    entityType: 'task',
    entityId: taskId,
    metadata: { templateId, itemCount: snapshotItems.length },
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath(`/projects/${task.projectId}`);
}

export async function toggleChecklistItem(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const taskId = String(formData.get('taskId') ?? '');
  const itemId = String(formData.get('itemId') ?? '');
  if (!taskId || !itemId) return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { assignedInstallerId: true, projectId: true, checklist: true },
  });
  if (!task || !task.checklist) return;

  const role = session.user.role;
  const isAssigned = task.assignedInstallerId === session.user.id;
  if (role === 'installer' && !isAssigned) return;

  const items = task.checklist.items as unknown as TaskChecklistItem[];
  let toggledCheck: 'on' | 'off' | null = null;
  const next = items.map((it) => {
    if (it.id !== itemId) return it;
    if (it.checkedAt) {
      toggledCheck = 'off';
      return { ...it, checkedAt: null, checkedById: null };
    }
    toggledCheck = 'on';
    return { ...it, checkedAt: new Date().toISOString(), checkedById: session.user.id };
  });
  if (!toggledCheck) return;

  await prisma.taskChecklist.update({
    where: { taskId },
    data: { items: next as unknown as object[] },
  });
  await logAudit({
    userId: session.user.id,
    action: toggledCheck === 'on' ? 'checklist.item_check' : 'checklist.item_uncheck',
    entityType: 'task',
    entityId: taskId,
    metadata: { itemId },
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath(`/projects/${task.projectId}`);
}
