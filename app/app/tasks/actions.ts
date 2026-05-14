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
import { sendPushToUser } from '@/lib/push';
import { nextAvailableForInstaller } from '@/lib/availability';
import { formatTime, DEFAULT_DURATION_MIN } from '@/lib/time';
import { humanDateLabel } from '@/lib/dates';

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

function parseEstimatedMinutes(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 60 * 24) return null;
  return Math.round(n);
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
  const session = await requireSchedulerOrAdmin();
  if (!session) {
    return { ok: false, error: 'Forbidden' };
  }

  const projectId = String(formData.get('projectId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const estimatedMinutes = parseEstimatedMinutes(formData.get('estimatedMinutes'));

  if (!projectId) return { ok: false, error: 'Missing project.' };
  if (title.length < 1 || title.length > 200) {
    return { ok: false, error: 'Title is required (max 200 chars).' };
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, error: 'Project not found.' };

  const created = await prisma.task.create({
    data: { projectId, title, description, estimatedMinutes },
  });
  await logAudit({
    userId: session.user.id,
    action: 'task.create',
    entityType: 'task',
    entityId: created.id,
    metadata: { title, projectId },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true, error: null };
}

export async function updateTask(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const session = await requireSchedulerOrAdmin();
  if (!session) {
    return { ok: false, error: 'Forbidden' };
  }

  const id = String(formData.get('id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim() || null;
  const status = String(formData.get('status') ?? '').trim();
  const estimatedMinutes = parseEstimatedMinutes(formData.get('estimatedMinutes'));

  if (!id) return { ok: false, error: 'Missing task id.' };
  if (title.length < 1 || title.length > 200) {
    return { ok: false, error: 'Title is required (max 200 chars).' };
  }
  if (!isStatus(status)) return { ok: false, error: 'Invalid status.' };

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: 'Task not found.' };

  const fields: string[] = [];
  if (existing.title !== title) fields.push('title');
  if (existing.description !== description) fields.push('description');
  if (existing.status !== status) fields.push('status');
  if (existing.estimatedMinutes !== estimatedMinutes) fields.push('duration');

  await prisma.task.update({
    where: { id },
    data: { title, description, status, estimatedMinutes },
  });
  if (fields.length > 0) {
    await logAudit({
      userId: session.user.id,
      action: 'task.update',
      entityType: 'task',
      entityId: id,
      metadata: { fields, statusFrom: existing.status, statusTo: status },
    });
  }

  revalidatePath(`/projects/${existing.projectId}`);
  revalidatePath(`/tasks/${id}`);
  return { ok: true, error: null };
}

export async function deleteTask(formData: FormData) {
  const session = await requireSchedulerOrAdmin();
  if (!session) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return;
  await prisma.task.delete({ where: { id } });
  await logAudit({
    userId: session.user.id,
    action: 'task.delete',
    entityType: 'task',
    entityId: id,
    metadata: { title: existing.title, projectId: existing.projectId },
  });
  revalidatePath(`/projects/${existing.projectId}`);
}

// ── Status quick-change (used by /me + /tasks/[id]) ───────────────────

export async function setTaskStatus(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;

  const taskId = String(formData.get('taskId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!taskId || !isStatus(status)) return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, assignedInstallerId: true, projectId: true, status: true },
  });
  if (!task) return;

  const role = session.user.role;
  const isAssigned = task.assignedInstallerId === session.user.id;
  const allowed = role === 'admin' || role === 'scheduler' || isAssigned;
  if (!allowed) return;
  if (task.status === status) return;

  await prisma.task.update({
    where: { id: task.id },
    data: { status },
  });
  await logAudit({
    userId: session.user.id,
    action: 'task.status',
    entityType: 'task',
    entityId: task.id,
    metadata: { from: task.status, to: status },
  });

  revalidatePath('/me');
  revalidatePath(`/tasks/${task.id}`);
  revalidatePath('/board');
  revalidatePath(`/projects/${task.projectId}`);
}

// ── Task timer (single-active per user) ───────────────────────────────

/**
 * Start a timer on a task.
 *
 * - If the user already has a running timer on this same task: no-op
 *   (idempotent against double-tap).
 * - If the user has a running timer on a *different* task: silently
 *   close it before opening the new one. UI surface drops a toast
 *   "Timer moved from X to Y" so the operator sees what happened.
 * - If the task is `pending`, auto-flip to `in_progress` in the same
 *   transaction. Stop does NOT auto-flip to done — that's an
 *   affirmative gesture the tech does separately.
 *
 * Permission: any signed-in user can start a timer on any task they
 * have visibility of (assigned installer, scheduler, or admin).
 */
export async function startTaskTimer(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const taskId = String(formData.get('taskId') ?? '');
  if (!taskId) return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, assignedInstallerId: true, status: true },
  });
  if (!task) return;
  const role = session.user.role;
  const isAssigned = task.assignedInstallerId === session.user.id;
  if (role !== 'admin' && role !== 'scheduler' && !isAssigned) return;

  await prisma.$transaction(async (tx) => {
    // Close any other running timer for this user (single-active).
    const others = await tx.timeEntry.findMany({
      where: { userId: session.user.id, stoppedAt: null },
      select: { id: true, taskId: true },
    });
    for (const o of others) {
      if (o.taskId === taskId) continue; // idempotent on same-task re-start
      await tx.timeEntry.update({
        where: { id: o.id },
        data: { stoppedAt: new Date() },
      });
    }
    // If we already have a running entry on this task, don't create another.
    const sameTaskRunning = others.find((o) => o.taskId === taskId);
    if (!sameTaskRunning) {
      await tx.timeEntry.create({
        data: { taskId, userId: session.user.id, source: 'manual' },
      });
    }
    // Auto-flip pending → in_progress so the tech doesn't need a 2nd tap.
    if (task.status === 'pending') {
      await tx.task.update({
        where: { id: task.id },
        data: { status: 'in_progress' },
      });
    }
  });

  await logAudit({
    userId: session.user.id,
    action: 'timer.start',
    entityType: 'task',
    entityId: taskId,
    metadata: { autoStatusFlip: task.status === 'pending' },
  });
  if (task.status === 'pending') {
    await logAudit({
      userId: session.user.id,
      action: 'task.status',
      entityType: 'task',
      entityId: taskId,
      metadata: { from: 'pending', to: 'in_progress', via: 'timer.start' },
    });
  }

  revalidatePath('/me');
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/board');
  revalidatePath(`/projects/${task.projectId}`);
}

/**
 * Stop the running timer for the current user. If there's no running
 * entry, no-op. Stop is terminal — to log more time, start a new entry.
 *
 * Optional `taskId` form field acts as a guard: if present, only stops
 * the running entry IF it's on that task. Avoids races where the tech
 * tapped Stop on an old screen but the running timer is now elsewhere.
 */
export async function stopTaskTimer(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const expectedTaskId = String(formData.get('taskId') ?? '') || null;

  const running = await prisma.timeEntry.findFirst({
    where: { userId: session.user.id, stoppedAt: null },
    orderBy: { startedAt: 'desc' },
    select: { id: true, taskId: true, task: { select: { projectId: true } } },
  });
  if (!running) return;
  if (expectedTaskId && running.taskId !== expectedTaskId) return;

  await prisma.timeEntry.update({
    where: { id: running.id },
    data: { stoppedAt: new Date() },
  });
  await logAudit({
    userId: session.user.id,
    action: 'timer.stop',
    entityType: 'task',
    entityId: running.taskId,
    metadata: { entryId: running.id },
  });

  revalidatePath('/me');
  revalidatePath(`/tasks/${running.taskId}`);
  revalidatePath('/board');
  revalidatePath(`/projects/${running.task.projectId}`);
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

  // Collect photo files. Empty file inputs come through as zero-byte
  // File objects, which we filter out before validation.
  const rawPhotos = formData.getAll('photos').filter((v): v is File => v instanceof File && v.size > 0);

  if (body.length < 1 && rawPhotos.length === 0) {
    return { ok: false, error: 'Note must include text or at least one photo.' };
  }
  for (const f of rawPhotos) {
    if (!PHOTO_ALLOWED_MIME.includes(f.type)) {
      return { ok: false, error: `Unsupported photo type: ${f.type || 'unknown'}.` };
    }
    if (f.size > PHOTO_MAX_BYTES) {
      return { ok: false, error: `Photo "${f.name}" is too large (max 15MB pre-resize).` };
    }
  }

  // Process photos to disk first. If any fails, abort before creating
  // the note — keeps the DB clean (the only leak is a half-written
  // jpg on disk, which is harmless).
  const processedPhotos: Array<{
    id: string;
    filename: string;
    width: number;
    height: number;
    sizeBytes: number;
  }> = [];
  for (const file of rawPhotos) {
    const buf = Buffer.from(await file.arrayBuffer());
    const photoId = randomUUID();
    try {
      const info = await processAndStorePhoto(buf, photoId);
      processedPhotos.push({ id: photoId, ...info });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      return { ok: false, error: `Could not process "${file.name}": ${msg}` };
    }
  }

  // One transaction for note + all photos. Disk writes already done.
  const noteId = await prisma.$transaction(async (tx) => {
    const note = await tx.note.create({
      data: {
        taskId,
        userId: session.user.id,
        // Empty body is allowed if photos are present; store as empty string.
        body: body.length > 0 ? body : '',
      },
    });
    if (processedPhotos.length > 0) {
      await tx.notePhoto.createMany({
        data: processedPhotos.map((p) => ({
          id: p.id,
          noteId: note.id,
          path: p.filename,
          width: p.width,
          height: p.height,
          sizeBytes: p.sizeBytes,
        })),
      });
    }
    return note.id;
  });
  await logAudit({
    userId: session.user.id,
    action: 'note.create',
    entityType: 'task',
    entityId: taskId,
    metadata: { noteId, photoCount: processedPhotos.length, hasBody: body.length > 0 },
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
  | { kind: 'column'; installerId: string; dateISO: string; startMinute?: number };

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
  const session = await requireSchedulerOrAdmin();
  if (!session) {
    return { ok: false, error: 'Forbidden' };
  }

  const task = await prisma.task.findUnique({
    where: { id: args.taskId },
    select: {
      id: true,
      title: true,
      assignedInstallerId: true,
      scheduledDate: true,
      projectId: true,
      project: { select: { name: true, clientName: true } },
    },
  });
  if (!task) return { ok: false, error: 'Task not found.' };

  if (args.target.kind === 'pool') {
    await prisma.task.update({
      where: { id: task.id },
      data: {
        scheduledDate: null,
        scheduledOrder: null,
        scheduledStartMinute: null,
        assignedInstallerId: null,
      },
    });
    await logAudit({
      userId: session.user.id,
      action: 'task.move',
      entityType: 'task',
      entityId: task.id,
      metadata: { target: { kind: 'pool' } },
    });
    revalidatePath('/board');
    revalidatePath(`/projects/${task.projectId}`);
    revalidatePath(`/tasks/${task.id}`);
    return { ok: true };
  }

  const { installerId, dateISO, startMinute } = args.target;
  const date = parseBoardDate(dateISO);
  if (!date) return { ok: false, error: 'Invalid date.' };

  const installer = await prisma.user.findUnique({
    where: { id: installerId },
    select: { id: true, name: true, role: true, active: true },
  });
  if (!installer || !installer.active || installer.role !== 'installer') {
    return { ok: false, error: 'Installer not available.' };
  }

  // Validate startMinute if provided (8am-5pm window). Out-of-range values
  // fall back to "leave it null" rather than rejecting the move outright —
  // we'd rather schedule the task with a fuzzy time than lose the drop.
  const safeStartMinute =
    typeof startMinute === 'number' &&
    Number.isInteger(startMinute) &&
    startMinute >= 0 &&
    startMinute < 24 * 60
      ? startMinute
      : null;

  // Single-task time-slot drop: just update the moved task's pin and skip
  // the column-wide reorder transaction (timeline view doesn't pass a
  // destOrderedTaskIds list — order is implicit from start times).
  if (safeStartMinute !== null) {
    await prisma.task.update({
      where: { id: task.id },
      data: {
        scheduledDate: date,
        scheduledStartMinute: safeStartMinute,
        scheduledOrder: null,
        assignedInstallerId: installerId,
      },
    });
  } else {
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
  }
  await logAudit({
    userId: session.user.id,
    action: 'task.move',
    entityType: 'task',
    entityId: task.id,
    metadata: { target: { kind: 'column', installerName: installer.name, dateISO } },
  });

  // Notify the installer when assignment changes. Same-assignee reorders or
  // date shifts don't fire a push — too noisy for the scheduler's normal
  // shuffle-the-week workflow.
  if (task.assignedInstallerId !== installerId) {
    const projectLabel = task.project.clientName
      ? `${task.project.name} · ${task.project.clientName}`
      : task.project.name;
    void sendPushToUser(installerId, {
      title: 'New task assigned',
      body: `${projectLabel}: ${task.title} (${dateISO})`,
      url: `/tasks/${task.id}`,
      tag: `task-assigned-${task.id}`,
    });
  }

  revalidatePath('/board');
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath(`/tasks/${task.id}`);
  return { ok: true };
}

// ── Auto-schedule: find the first contiguous gap that fits ───────────

export type ScheduleNextState = {
  ok: boolean;
  error: string | null;
  message: string | null;
};

/**
 * Core auto-schedule logic, callable directly from client code (board pool
 * button) or via the form-state wrapper below (task screen). When
 * `installerId` is absent, runs the gap finder for every active installer
 * in parallel and picks the earliest (dateISO, startMin).
 */
export async function autoScheduleTask(args: {
  taskId: string;
  installerId?: string;
}): Promise<ScheduleNextState> {
  const session = await requireSchedulerOrAdmin();
  if (!session) return { ok: false, error: 'Forbidden', message: null };

  const taskId = args.taskId.trim();
  if (!taskId) return { ok: false, error: 'Missing taskId.', message: null };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      estimatedMinutes: true,
      assignedInstallerId: true,
      projectId: true,
      project: { select: { name: true, clientName: true } },
    },
  });
  if (!task) return { ok: false, error: 'Task not found.', message: null };

  const durationMin = task.estimatedMinutes ?? DEFAULT_DURATION_MIN;

  type Candidate = { installerId: string; installerName: string; dateISO: string; startMin: number };

  let chosen: Candidate | null = null;
  let firstError: string | null = null;

  if (args.installerId) {
    const installer = await prisma.user.findUnique({
      where: { id: args.installerId },
      select: { id: true, name: true, role: true, active: true },
    });
    if (!installer || !installer.active || installer.role !== 'installer') {
      return { ok: false, error: 'Installer not available.', message: null };
    }
    const slot = await nextAvailableForInstaller({
      installerId: installer.id,
      durationMin,
      excludeTaskId: task.id,
    });
    if (!slot.ok) return { ok: false, error: slot.error, message: null };
    chosen = {
      installerId: installer.id,
      installerName: installer.name,
      dateISO: slot.dateISO,
      startMin: slot.startMin,
    };
  } else {
    const installers = await prisma.user.findMany({
      where: { role: 'installer', active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    if (installers.length === 0) {
      return { ok: false, error: 'No active installers.', message: null };
    }
    const slots = await Promise.all(
      installers.map(async (i) => ({
        installer: i,
        slot: await nextAvailableForInstaller({
          installerId: i.id,
          durationMin,
          excludeTaskId: task.id,
        }),
      })),
    );
    for (const { installer, slot } of slots) {
      if (!slot.ok) {
        firstError = slot.error;
        continue;
      }
      if (
        !chosen ||
        slot.dateISO < chosen.dateISO ||
        (slot.dateISO === chosen.dateISO && slot.startMin < chosen.startMin)
      ) {
        chosen = {
          installerId: installer.id,
          installerName: installer.name,
          dateISO: slot.dateISO,
          startMin: slot.startMin,
        };
      }
    }
    if (!chosen) {
      return {
        ok: false,
        error: firstError ?? `No ${durationMin}-min gap on any installer in next 30 days.`,
        message: null,
      };
    }
  }

  const date = new Date(chosen.dateISO + 'T00:00:00.000Z');
  await prisma.task.update({
    where: { id: task.id },
    data: {
      assignedInstallerId: chosen.installerId,
      scheduledDate: date,
      scheduledStartMinute: chosen.startMin,
      scheduledOrder: null,
    },
  });
  await logAudit({
    userId: session.user.id,
    action: 'task.move',
    entityType: 'task',
    entityId: task.id,
    metadata: {
      target: { kind: 'column', installerName: chosen.installerName, dateISO: chosen.dateISO },
      autoSchedule: true,
      autoPickedInstaller: !args.installerId,
      startMinute: chosen.startMin,
    },
  });

  if (task.assignedInstallerId !== chosen.installerId) {
    const projectLabel = task.project.clientName
      ? `${task.project.name} · ${task.project.clientName}`
      : task.project.name;
    void sendPushToUser(chosen.installerId, {
      title: 'New task assigned',
      body: `${projectLabel}: ${task.title} (${chosen.dateISO})`,
      url: `/tasks/${task.id}`,
      tag: `task-assigned-${task.id}`,
    });
  }

  revalidatePath('/board');
  revalidatePath('/board/horizon');
  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath(`/tasks/${task.id}`);

  return {
    ok: true,
    error: null,
    message: `Scheduled to ${chosen.installerName} on ${humanDateLabel(chosen.dateISO)} at ${formatTime(chosen.startMin)}.`,
  };
}

// useActionState wrapper for the task-screen form.
export async function scheduleNextAvailable(
  _prev: ScheduleNextState,
  formData: FormData,
): Promise<ScheduleNextState> {
  return autoScheduleTask({
    taskId: String(formData.get('taskId') ?? ''),
    installerId: String(formData.get('installerId') ?? '') || undefined,
  });
}
