'use client';

import { useActionState, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { createChecklistTemplate, type ChecklistResult } from './actions';

const initial: ChecklistResult = { ok: false, error: null };

export default function NewTemplateForm() {
  const [state, action] = useActionState(createChecklistTemplate, initial);
  const formRef = useRef<HTMLFormElement>(null);
  if (state.ok) queueMicrotask(() => formRef.current?.reset());

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Name</span>
        <input
          name="name"
          required
          placeholder="e.g. Graphic install — Type A"
          className="rounded border border-neutral-300 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Description (optional)</span>
        <input
          name="description"
          placeholder="Short reminder of when to use this template."
          className="rounded border border-neutral-300 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Items (one per line)</span>
        <textarea
          name="items"
          required
          rows={8}
          placeholder={
            'Pre-arrival: confirm parking + access\n' +
            'Set drop cloths\n' +
            'Install graphics per spec\n' +
            'Vacuum + remove debris\n' +
            'Walk-through with client\n' +
            'Client sign-off photo'
          }
          className="font-mono rounded border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        <span className="text-xs text-neutral-500">
          All items are required at v1. Per-item optional / photo / signature
          marks land in a follow-up sprint.
        </span>
      </label>
      {state.error && (
        <p className="text-xs text-red-700 dark:text-red-300">{state.error}</p>
      )}
      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
    >
      {pending ? 'Saving…' : 'Save template'}
    </button>
  );
}
