import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type AuditAction =
  // Tasks
  | 'task.create'
  | 'task.update'
  | 'task.delete'
  | 'task.move'
  | 'task.status'
  // Notes
  | 'note.create'
  // Timer
  | 'timer.start'
  | 'timer.stop'
  // Projects
  | 'project.create'
  | 'project.update'
  | 'project.archive'
  | 'project.unarchive'
  | 'project.delete'
  // Users
  | 'user.create'
  | 'user.role_change'
  | 'user.activate'
  | 'user.deactivate'
  | 'user.password_reset'
  | 'user.color_change'
  | 'user.password_change_self';

export type EntityType = 'task' | 'project' | 'user' | 'note';

export async function logAudit(args: {
  userId: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: args.userId,
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId,
        metadata: (args.metadata ?? null) as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    // Audit failures must never break the underlying mutation. Log and move on.
    // eslint-disable-next-line no-console
    console.error('audit log failed', { action: args.action, entityId: args.entityId, error: e });
  }
}

export function describeAuditEvent(
  action: AuditAction,
  metadata: Record<string, unknown> | null,
): string {
  switch (action) {
    case 'task.create':
      return 'created the task';
    case 'task.update': {
      const fields = (metadata?.fields as string[] | undefined) ?? [];
      return fields.length > 0 ? `edited ${fields.join(', ')}` : 'edited the task';
    }
    case 'task.delete':
      return 'deleted the task';
    case 'task.move': {
      const target = metadata?.target as
        | { kind: 'pool' }
        | { kind: 'column'; installerName?: string; dateISO?: string }
        | undefined;
      if (!target) return 'moved the task';
      if (target.kind === 'pool') return 'moved the task back to the pool';
      const who = target.installerName ?? 'an installer';
      const when = target.dateISO ?? '';
      return `scheduled to ${who}${when ? ` on ${when}` : ''}`;
    }
    case 'task.status': {
      const from = metadata?.from as string | undefined;
      const to = metadata?.to as string | undefined;
      if (from && to) return `changed status: ${from} → ${to}`;
      return 'changed status';
    }
    case 'note.create':
      return 'added a note';
    case 'timer.start': {
      const flip = metadata?.autoStatusFlip;
      return flip ? 'started a timer (status → in progress)' : 'started a timer';
    }
    case 'timer.stop':
      return 'stopped the timer';
    case 'project.create':
      return 'created the project';
    case 'project.update':
      return 'edited the project';
    case 'project.archive':
      return 'archived the project';
    case 'project.unarchive':
      return 'unarchived the project';
    case 'project.delete': {
      const name = metadata?.name as string | undefined;
      const taskCount = metadata?.taskCount as number | undefined;
      const tail = taskCount && taskCount > 0
        ? ` (with ${taskCount} task${taskCount === 1 ? '' : 's'})`
        : '';
      return name ? `deleted the project "${name}"${tail}` : `deleted the project${tail}`;
    }
    case 'user.create':
      return 'created the user';
    case 'user.role_change': {
      const to = metadata?.to as string | undefined;
      return to ? `changed role to ${to}` : 'changed role';
    }
    case 'user.activate':
      return 'enabled the user';
    case 'user.deactivate':
      return 'disabled the user';
    case 'user.password_reset':
      return 'reset the password';
    case 'user.color_change':
      return 'changed the board color';
    case 'user.password_change_self':
      return 'changed their own password';
    default:
      return action;
  }
}
