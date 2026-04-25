'use client';

import { useActionState } from 'react';
import { createProject, type ProjectFormState } from './actions';

const initial: ProjectFormState = { ok: false, error: null };

export default function CreateProjectForm() {
  const [state, formAction, pending] = useActionState(createProject, initial);
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded border border-neutral-200 bg-white p-4 sm:grid-cols-3 dark:border-neutral-800 dark:bg-neutral-900">
      <label className="flex flex-col gap-1 text-sm">
        <span>Project name</span>
        <input name="name" required maxLength={120} className="rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Client (optional)</span>
        <input name="clientName" maxLength={120} className="rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Color (optional)</span>
        <input name="color" placeholder="#2563eb" pattern="#[0-9a-fA-F]{6}" className="rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white">
          {pending ? 'Creating…' : 'Create project'}
        </button>
        {state.error && <span className="text-sm text-red-700 dark:text-red-300">{state.error}</span>}
      </div>
    </form>
  );
}
