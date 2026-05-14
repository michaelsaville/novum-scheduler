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
  // Deficiencies
  | 'deficiency.create'
  | 'deficiency.resolve'
  | 'deficiency.waive'
  // Checklists
  | 'checklist.template_create'
  | 'checklist.template_delete'
  | 'checklist.apply'
  | 'checklist.item_check'
  | 'checklist.item_uncheck'
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
    case 'deficiency.create': {
      const sev = metadata?.severity as string | undefined;
      const tail = sev ? ` (${sev})` : '';
      return `raised a deficiency${tail}`;
    }
    case 'deficiency.resolve':
      return 'resolved a deficiency';
    case 'deficiency.waive':
      return 'waived a cosmetic deficiency';
    case 'checklist.template_create':
      return 'created a checklist template';
    case 'checklist.template_delete':
      return 'removed a checklist template';
    case 'checklist.apply':
      return 'applied a checklist to the task';
    case 'checklist.item_check':
      return 'checked off a checklist item';
    case 'checklist.item_uncheck':
      return 'un-checked a checklist item';
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
