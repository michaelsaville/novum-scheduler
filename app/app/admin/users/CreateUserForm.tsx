'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createUser, type AdminUserState } from './actions';

const initial: AdminUserState = { ok: false, error: null, message: null, reveal: null };

export default function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUser, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <div className="flex flex-col gap-3 rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-lg font-medium">Create user</h2>
      <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>Full name</span>
          <input name="name" required maxLength={80} className="rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Username (login)</span>
          <input name="username" required pattern="[a-z0-9._-]{2,32}" placeholder="e.g. jsmith" className="rounded border border-neutral-300 bg-white px-3 py-2 lowercase dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Role</span>
          <select name="role" required defaultValue="installer" className="rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
            <option value="installer">installer</option>
            <option value="scheduler">scheduler</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Board color (optional, 6-digit hex)</span>
          <input name="color" placeholder="#2563eb" pattern="#[0-9a-fA-F]{6}" className="rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800" />
        </label>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={pending} className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white">
            {pending ? 'Creating…' : 'Create user'}
          </button>
          {state.error && <span className="text-sm text-red-700 dark:text-red-300">{state.error}</span>}
        </div>
      </form>
      {state.reveal && (
        <div className="rounded bg-amber-50 p-3 text-sm dark:bg-amber-950">
          <p className="font-medium text-amber-900 dark:text-amber-200">{state.message}</p>
          <p className="mt-2 font-mono text-amber-900 dark:text-amber-200">
            <strong>{state.reveal.username}</strong> · <span className="select-all">{state.reveal.password}</span>
          </p>
        </div>
      )}
    </div>
  );
}
