'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createNote, type NoteFormState } from '@/app/tasks/actions';

const initial: NoteFormState = { ok: false, error: null };

export default function AddNoteForm({ taskId }: { taskId: string }) {
  const [state, formAction, pending] = useActionState(createNote, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [photoCount, setPhotoCount] = useState(0);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setPhotoCount(0);
    }
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-2 rounded border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <input type="hidden" name="taskId" value={taskId} />
      <textarea
        name="body"
        rows={3}
        maxLength={4000}
        placeholder="Add a note (text or photos)…"
        className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            capture="environment"
            onChange={(e) => setPhotoCount(e.target.files?.length ?? 0)}
            className="block text-xs file:mr-2 file:rounded file:border file:border-neutral-300 file:bg-white file:px-2 file:py-1 file:text-xs file:font-medium file:text-neutral-700 hover:file:bg-neutral-50 dark:file:border-neutral-700 dark:file:bg-neutral-800 dark:file:text-neutral-200"
          />
          {photoCount > 0 && (
            <span className="text-xs text-neutral-500">
              {photoCount} photo{photoCount === 1 ? '' : 's'} attached
            </span>
          )}
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
          >
            {pending ? 'Adding…' : 'Add note'}
          </button>
        </div>
      </div>
      {state.error && <span className="text-sm text-red-700 dark:text-red-300">{state.error}</span>}
    </form>
  );
}
