'use client';

import { useActionState } from 'react';
import { updateProject, type ProjectFormState } from '../actions';

const initial: ProjectFormState = { ok: false, error: null };

type Props = {
  project: {
    id: string;
    name: string;
    clientName: string | null;
    color: string | null;
    status: string;
    clientEmail: string | null;
    notifyClient: boolean;
  };
};

export default function EditProjectForm({ project }: Props) {
  const [state, formAction, pending] = useActionState(updateProject, initial);
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 rounded border border-neutral-200 bg-white p-4 sm:grid-cols-2 dark:border-neutral-800 dark:bg-neutral-900">
      <input type="hidden" name="id" value={project.id} />
      <label className="flex flex-col gap-1 text-sm">
        <span>Project name</span>
        <input name="name" required maxLength={120} defaultValue={project.name} className="rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Client</span>
        <input name="clientName" maxLength={120} defaultValue={project.clientName ?? ''} className="rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Color</span>
        <input name="color" placeholder="#2563eb" pattern="#[0-9a-fA-F]{6}" defaultValue={project.color ?? ''} className="rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Status</span>
        <select name="status" defaultValue={project.status} className="rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
          <option value="active">active</option>
          <option value="on_hold">on hold</option>
          <option value="done">done</option>
        </select>
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <span className="text-sm font-medium">Client communication</span>
        <input
          name="clientEmail"
          type="email"
          placeholder="client@example.com"
          defaultValue={project.clientEmail ?? ''}
          className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="notifyClient"
            defaultChecked={project.notifyClient}
            className="mt-1"
          />
          <span>
            Email the client on task completions and resolved issues.
            <span className="block text-xs text-neutral-500">
              Set an email above before enabling.
            </span>
          </span>
        </label>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white">
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {state.error && <span className="text-sm text-red-700 dark:text-red-300">{state.error}</span>}
        {state.ok && <span className="text-sm text-green-700 dark:text-green-300">Saved.</span>}
      </div>
    </form>
  );
}
