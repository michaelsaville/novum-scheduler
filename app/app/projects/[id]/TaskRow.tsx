'use client';

import { useActionState, useState } from 'react';
import { updateTask, deleteTask, type TaskFormState } from '@/app/tasks/actions';

const initial: TaskFormState = { ok: false, error: null };

type Installer = { id: string; name: string; color: string | null };

type Props = {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: 'pending' | 'in_progress' | 'done' | 'blocked';
    scheduledDate: Date | null;
    assignedInstallerId: string | null;
  };
  installers: Installer[];
};

export default function TaskRow({ task, installers }: Props) {
  const [state, formAction, pending] = useActionState(updateTask, initial);
  const [editing, setEditing] = useState(false);

  const installer = installers.find((i) => i.id === task.assignedInstallerId);
  const scheduledLabel = task.scheduledDate
    ? new Date(task.scheduledDate).toISOString().slice(0, 10)
    : null;

  if (!editing) {
    return (
      <li className="flex items-start justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{task.title}</span>
            <StatusPill status={task.status} />
          </div>
          {task.description && (
            <div className="mt-0.5 text-xs text-neutral-500 whitespace-pre-wrap">
              {task.description}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
            {scheduledLabel ? <span>📅 {scheduledLabel}</span> : <span>📥 in pool</span>}
            {installer && (
              <span className="flex items-center gap-1">
                {installer.color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: installer.color }} />}
                {installer.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setEditing(true)} className="text-xs underline">edit</button>
          <form action={deleteTask}>
            <input type="hidden" name="id" value={task.id} />
            <button type="submit" className="text-xs text-red-700 underline dark:text-red-300">delete</button>
          </form>
        </div>
      </li>
    );
  }

  return (
    <li className="px-3 py-2">
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={task.id} />
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={task.title}
          className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        <textarea
          name="description"
          rows={2}
          defaultValue={task.description ?? ''}
          placeholder="Description (optional)"
          className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        <select name="status" defaultValue={task.status} className="self-start rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800">
          <option value="pending">pending</option>
          <option value="in_progress">in progress</option>
          <option value="done">done</option>
          <option value="blocked">blocked</option>
        </select>
        <div className="flex items-center gap-3 text-sm">
          <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white">
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs underline">cancel</button>
          {state.error && <span className="text-xs text-red-700 dark:text-red-300">{state.error}</span>}
          {state.ok && <span className="text-xs text-green-700 dark:text-green-300">Saved.</span>}
        </div>
      </form>
    </li>
  );
}

function StatusPill({ status }: { status: 'pending' | 'in_progress' | 'done' | 'blocked' }) {
  const map: Record<string, string> = {
    pending: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${map[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
