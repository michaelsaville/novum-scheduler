'use client';

import { deleteProject } from '../actions';

export default function DeleteProjectButton({
  id,
  name,
  taskCount,
}: {
  id: string;
  name: string;
  taskCount: number;
}) {
  return (
    <form
      action={deleteProject}
      onSubmit={(e) => {
        const msg =
          taskCount > 0
            ? `Delete "${name}" and its ${taskCount} task${taskCount === 1 ? '' : 's'} (plus all notes and photos)?\n\nThis cannot be undone.`
            : `Delete "${name}"?\n\nThis cannot be undone.`;
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
      >
        Delete project
      </button>
    </form>
  );
}
