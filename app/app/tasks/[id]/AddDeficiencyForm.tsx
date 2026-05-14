'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createDeficiency, type DeficiencyResult } from '@/app/deficiencies/actions';

const initial: DeficiencyResult = { ok: false, error: null };

export default function AddDeficiencyForm({ taskId }: { taskId: string }) {
  const [state, action] = useActionState(createDeficiency, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [open, setOpen] = useState(false);

  // Reset on success — the page revalidate brings new deficiency rows
  // back into view and we want a clean slate for the next one.
  if (state.ok && open) {
    queueMicrotask(() => {
      formRef.current?.reset();
      setPhotoCount(0);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded border border-amber-300 px-3 py-2 text-sm text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
      >
        + Add deficiency
      </button>
    );
  }

  return (
    <form
      action={action}
      ref={formRef}
      className="flex flex-col gap-3 rounded border border-amber-300 bg-amber-50/50 p-3 dark:border-amber-700 dark:bg-amber-950/30"
    >
      <input type="hidden" name="taskId" value={taskId} />
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Raise deficiency
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
        >
          cancel
        </button>
      </div>
      <textarea
        name="description"
        rows={3}
        required
        maxLength={2000}
        placeholder="What's wrong? Specific is better than vague."
        className="rounded border border-amber-300 bg-white p-2 dark:border-amber-700 dark:bg-neutral-900"
      />
      <div>
        <label
          htmlFor="severity"
          className="mb-1 block text-xs font-medium text-amber-900 dark:text-amber-200"
        >
          Severity
        </label>
        <select
          id="severity"
          name="severity"
          defaultValue="functional"
          className="rounded border border-amber-300 bg-white p-2 dark:border-amber-700 dark:bg-neutral-900"
        >
          <option value="cosmetic">Cosmetic — fix in 30 days; can be waived</option>
          <option value="functional">Functional — fix in 14 days; blocks task close</option>
          <option value="safety">Safety — fix in 24 hours; blocks task close</option>
        </select>
      </div>
      <div>
        <label
          htmlFor="photos"
          className="mb-1 block text-xs font-medium text-amber-900 dark:text-amber-200"
        >
          Before photos (optional)
        </label>
        <input
          id="photos"
          name="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          multiple
          onChange={(e) => setPhotoCount(e.target.files?.length ?? 0)}
          className="block w-full text-sm text-amber-900 dark:text-amber-200"
        />
        {photoCount > 0 && (
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            {photoCount} photo{photoCount === 1 ? '' : 's'} attached
          </p>
        )}
      </div>
      {state.error && (
        <p className="text-xs text-red-700 dark:text-red-300">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-end rounded bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Raise deficiency'}
    </button>
  );
}
