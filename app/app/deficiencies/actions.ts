'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  processAndStorePhoto,
  PHOTO_MAX_BYTES,
  PHOTO_ALLOWED_MIME,
} from '@/lib/uploads';
import { logAudit } from '@/lib/audit';
import type { DeficiencySeverity } from '@prisma/client';

export type DeficiencyResult = { ok: boolean; error: string | null };

const SEVERITIES = ['cosmetic', 'functional', 'safety'] as const;
function isSeverity(s: string): s is DeficiencySeverity {
  return (SEVERITIES as readonly string[]).includes(s);
}

/** Severity → fix window in days. Pulled from InspectHub's NSPIRE pattern. */
function dueByForSeverity(sev: DeficiencySeverity): Date {
  const now = new Date();
  const days = sev === 'safety' ? 1 : sev === 'functional' ? 14 : 30;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

async function processPhotos(files: File[], kind: 'before' | 'after') {
  const out: Array<{
    id: string;
    filename: string;
    width: number;
    height: number;
    sizeBytes: number;
    kind: 'before' | 'after';
  }> = [];
  for (const f of files) {
    if (!PHOTO_ALLOWED_MIME.includes(f.type)) {
      throw new Error(`Unsupported photo type: ${f.type || 'unknown'}.`);
    }
    if (f.size > PHOTO_MAX_BYTES) {
      throw new Error(`Photo "${f.name}" is too large (max 15MB pre-resize).`);
    }
    const buf = Buffer.from(await f.arrayBuffer());
    const photoId = randomUUID();
    const info = await processAndStorePhoto(buf, photoId);
    out.push({ id: photoId, ...info, kind });
  }
  return out;
}

export async function createDeficiency(
  _prev: DeficiencyResult,
  formData: FormData,
): Promise<DeficiencyResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Not signed in' };

  const taskId = String(formData.get('taskId') ?? '');
  const description = String(formData.get('description') ?? '').trim();
  const severityRaw = String(formData.get('severity') ?? 'functional');
  const severity: DeficiencySeverity = isSeverity(severityRaw) ? severityRaw : 'functional';

  if (!taskId) return { ok: false, error: 'Missing task.' };
  if (description.length < 1 || description.length > 2000) {
    return { ok: false, error: 'Description is required (max 2000 chars).' };
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, assignedInstallerId: true },
  });
  if (!task) return { ok: false, error: 'Task not found.' };

  const role = session.user.role;
  const isAssigned = task.assignedInstallerId === session.user.id;
  if (role === 'installer' && !isAssigned) {
    return { ok: false, error: 'Not your task.' };
  }

  const rawPhotos = formData
    .getAll('photos')
    .filter((v): v is File => v instanceof File && v.size > 0);

  let processedPhotos: Awaited<ReturnType<typeof processPhotos>> = [];
  try {
    processedPhotos = await processPhotos(rawPhotos, 'before');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return { ok: false, error: msg };
  }

  const created = await prisma.$transaction(async (tx) => {
    const def = await tx.deficiency.create({
      data: {
        taskId,
        raisedById: session.user.id,
        description,
        severity,
        dueBy: dueByForSeverity(severity),
      },
    });
    if (processedPhotos.length > 0) {
      await tx.deficiencyPhoto.createMany({
        data: processedPhotos.map((p) => ({
          id: p.id,
          deficiencyId: def.id,
          kind: p.kind,
          path: p.filename,
          width: p.width,
          height: p.height,
          sizeBytes: p.sizeBytes,
        })),
      });
    }
    return def;
  });

  await logAudit({
    userId: session.user.id,
    action: 'deficiency.create',
    entityType: 'task',
    entityId: taskId,
    metadata: {
      deficiencyId: created.id,
      severity,
      photoCount: processedPhotos.length,
    },
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/deficiencies');
  revalidatePath(`/projects/${task.projectId}`);
  return { ok: true, error: null };
}

export async function resolveDeficiency(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;

  const id = String(formData.get('id') ?? '');
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!id) return;

  const def = await prisma.deficiency.findUnique({
    where: { id },
    include: { task: { select: { id: true, assignedInstallerId: true, projectId: true } } },
  });
  if (!def) return;

  const role = session.user.role;
  const isAssigned = def.task.assignedInstallerId === session.user.id;
  if (role === 'installer' && !isAssigned) return;

  const rawPhotos = formData
    .getAll('photos')
    .filter((v): v is File => v instanceof File && v.size > 0);

  let processedPhotos: Awaited<ReturnType<typeof processPhotos>> = [];
  try {
    processedPhotos = await processPhotos(rawPhotos, 'after');
  } catch {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.deficiency.update({
      where: { id },
      data: {
        status: 'fixed',
        resolvedAt: new Date(),
        resolvedById: session.user.id,
        resolvedNote: note,
      },
    });
    if (processedPhotos.length > 0) {
      await tx.deficiencyPhoto.createMany({
        data: processedPhotos.map((p) => ({
          id: p.id,
          deficiencyId: id,
          kind: p.kind,
          path: p.filename,
          width: p.width,
          height: p.height,
          sizeBytes: p.sizeBytes,
        })),
      });
    }
  });

  await logAudit({
    userId: session.user.id,
    action: 'deficiency.resolve',
    entityType: 'task',
    entityId: def.taskId,
    metadata: { deficiencyId: id, photoCount: processedPhotos.length },
  });

  revalidatePath(`/tasks/${def.taskId}`);
  revalidatePath('/deficiencies');
  revalidatePath(`/projects/${def.task.projectId}`);
}

export async function waiveDeficiency(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  if (session.user.role !== 'admin' && session.user.role !== 'scheduler') return;
  const id = String(formData.get('id') ?? '');
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!id) return;

  const def = await prisma.deficiency.findUnique({
    where: { id },
    select: { taskId: true, severity: true, task: { select: { projectId: true } } },
  });
  if (!def) return;
  // Cosmetic-only: safety/functional require an actual fix per the
  // close-out gate's logic. This mirrors InspectHub's policy.
  if (def.severity !== 'cosmetic') return;

  await prisma.deficiency.update({
    where: { id },
    data: {
      status: 'waived',
      resolvedAt: new Date(),
      resolvedById: session.user.id,
      resolvedNote: note,
    },
  });
  await logAudit({
    userId: session.user.id,
    action: 'deficiency.waive',
    entityType: 'task',
    entityId: def.taskId,
    metadata: { deficiencyId: id },
  });

  revalidatePath(`/tasks/${def.taskId}`);
  revalidatePath('/deficiencies');
  revalidatePath(`/projects/${def.task.projectId}`);
}
