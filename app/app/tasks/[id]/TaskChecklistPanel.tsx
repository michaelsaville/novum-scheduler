'use client';

import { useFormStatus } from 'react-dom';
import {
  applyChecklistToTask,
  toggleChecklistItem,
  type TaskChecklistItem,
} from '@/app/admin/checklists/actions';

export type TaskChecklistForUI = {
  templateName: string;
  items: TaskChecklistItem[];
};

export default function TaskChecklistPanel({
  taskId,
  checklist,
  templates,
  canApply,
  canCheck,
}: {
  taskId: string;
  checklist: TaskChecklistForUI | null;
  templates: { id: string; name: string }[];
  canApply: boolean;
  canCheck: boolean;
}) {
  if (!checklist) {
    if (!canApply || templates.length === 0) {
      // Show a placeholder for installers so they know one was expected.
      if (templates.length === 0) {
        return null;
      }
      return (
        <p className="text-sm text-neutral-500">
          No checklist applied. A scheduler can attach one.
        </p>
      );
    }
    return (
      <form action={applyChecklistToTask} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="taskId" value={taskId} />
        <label className="text-sm">Apply checklist:</label>
        <select
          name="templateId"
          required
          defaultValue=""
          className="rounded border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        >
          <option value="" disabled>
            choose a template…
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <ApplyButton />
      </form>
    );
  }

  const total = checklist.items.length;
  const checked = checklist.items.filter((it) => it.checkedAt).length;
  const requiredUnchecked = checklist.items.filter(
    (it) => it.required !== false && !it.checkedAt,
  ).length;

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{checklist.templateName}</h3>
        <span className="text-xs text-neutral-500">
          {checked} of {total}
          {requiredUnchecked > 0 && (
            <span className="ml-2 text-red-700 dark:text-red-300">
              · {requiredUnchecked} required left
            </span>
          )}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {checklist.items.map((it) => (
          <li key={it.id}>
            <form action={toggleChecklistItem} className="flex items-start gap-2">
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="itemId" value={it.id} />
              <ToggleButton checked={Boolean(it.checkedAt)} disabled={!canCheck} />
              <span
                className={
                  it.checkedAt
                    ? 'text-sm text-neutral-500 line-through'
                    : 'text-sm'
                }
              >
                {it.label}
                {it.required !== false && !it.checkedAt && (
                  <span className="ml-1 text-xs text-red-700 dark:text-red-300">
                    *
                  </span>
                )}
              </span>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ApplyButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
    >
      {pending ? 'Applying…' : 'Apply'}
    </button>
  );
}

function ToggleButton({ checked, disabled }: { checked: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-label={checked ? 'Mark unchecked' : 'Mark checked'}
      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
        checked
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-neutral-400 bg-white dark:border-neutral-600 dark:bg-neutral-800'
      } ${disabled ? 'opacity-50' : 'hover:border-emerald-400'}`}
    >
      {checked && <span aria-hidden className="text-xs leading-none">✓</span>}
    </button>
  );
}
