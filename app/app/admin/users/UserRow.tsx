'use client';

import { useActionState } from 'react';
import {
  resetPassword,
  setActive,
  setRole,
  setColor,
  type AdminUserState,
} from './actions';

const initial: AdminUserState = { ok: false, error: null, message: null, reveal: null };

type RowUser = {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'scheduler' | 'installer';
  color: string | null;
  active: boolean;
  isSelf: boolean;
};

export default function UserRow({ user }: { user: RowUser }) {
  const [resetState, resetAction, resetPending] = useActionState(resetPassword, initial);
  const [activeState, activeAction, activePending] = useActionState(setActive, initial);
  const [roleState, roleAction, rolePending] = useActionState(setRole, initial);
  const [colorState, colorAction, colorPending] = useActionState(setColor, initial);

  const errorMsg = resetState.error || activeState.error || roleState.error || colorState.error;
  const okMsg = (!errorMsg && (resetState.message || activeState.message || roleState.message || colorState.message)) || null;
  const reveal = resetState.reveal;

  return (
    <tr className={user.active ? '' : 'opacity-50'}>
      <td className="px-3 py-2 align-top">
        <div className="font-medium">{user.name}</div>
        <div className="text-xs text-neutral-500">{user.username}</div>
        {user.isSelf && <div className="text-xs text-amber-700 dark:text-amber-300">(you)</div>}
      </td>
      <td className="px-3 py-2 align-top">
        <form action={roleAction} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <select name="role" defaultValue={user.role} className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800">
            <option value="installer">installer</option>
            <option value="scheduler">scheduler</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" disabled={rolePending} className="text-xs underline disabled:opacity-50">
            save
          </button>
        </form>
      </td>
      <td className="px-3 py-2 align-top">
        <form action={colorAction} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <input
            name="color"
            defaultValue={user.color ?? ''}
            placeholder="#2563eb"
            pattern="#[0-9a-fA-F]{6}"
            className="w-24 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
          {user.color && (
            <span className="inline-block h-4 w-4 rounded border border-neutral-300" style={{ backgroundColor: user.color }} />
          )}
          <button type="submit" disabled={colorPending} className="text-xs underline disabled:opacity-50">
            save
          </button>
        </form>
      </td>
      <td className="px-3 py-2 align-top">
        <form action={activeAction} className="inline">
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="active" value={user.active ? 'false' : 'true'} />
          <button type="submit" disabled={activePending || user.isSelf} className="text-xs underline disabled:opacity-50">
            {user.active ? 'disable' : 'enable'}
          </button>
        </form>
      </td>
      <td className="px-3 py-2 align-top">
        <form action={resetAction} className="inline">
          <input type="hidden" name="userId" value={user.id} />
          <button type="submit" disabled={resetPending} className="text-xs underline disabled:opacity-50">
            reset password
          </button>
        </form>
        {(errorMsg || okMsg || reveal) && (
          <div className="mt-2 text-xs">
            {errorMsg && <p className="text-red-700 dark:text-red-300">{errorMsg}</p>}
            {okMsg && !reveal && <p className="text-green-700 dark:text-green-300">{okMsg}</p>}
            {reveal && (
              <div className="rounded bg-amber-50 p-2 dark:bg-amber-950">
                <p className="text-amber-900 dark:text-amber-200">New one-time password — capture now:</p>
                <p className="mt-1 font-mono text-amber-900 dark:text-amber-200">
                  <strong>{reveal.username}</strong> · <span className="select-all">{reveal.password}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
