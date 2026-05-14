'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { resolveDeficiency, waiveDeficiency } from '@/app/deficiencies/actions';
import { BUSINESS_TIMEZONE } from '@/lib/dates';

export type DeficiencyForUI = {
  id: string;
  description: string;
  severity: 'cosmetic' | 'functional' | 'safety';
  status: 'open' | 'scheduled' | 'fixed' | 'waived';
  dueBy: string | null; // ISO
  resolvedAt: string | null;
  resolvedNote: string | null;
  raisedByName: string;
  resolvedByName: string | null;
  photos: { id: string; kind: string; width: number; height: number }[];
};

const SEVERITY_STYLES: Record<DeficiencyForUI['severity'], string> = {
  safety: 'border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/40',
  functional: 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40',
  cosmetic: 'border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900',
};

const SEVERITY_LABELS: Record<DeficiencyForUI['severity'], string> = {
  safety: 'SAFETY · 24h',
  functional: 'FUNCTIONAL · 14d',
  cosmetic: 'COSMETIC · 30d',
};

export default function DeficiencyItem({
  d,
  canResolve,
  canWaive,
}: {
  d: DeficiencyForUI;
  canResolve: boolean;
  canWaive: boolean;
}) {
  const [showResolve, setShowResolve] = useState(false);
  const isOpen = d.status === 'open';
  const isResolved = d.status === 'fixed' || d.status === 'waived';

  return (
    <li className={`rounded border p-3 ${SEVERITY_STYLES[d.severity]} ${isResolved ? 'opacity-70' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider">
          {SEVERITY_LABELS[d.severity]}
        </span>
        <StatusPill status={d.status} />
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{d.description}</p>
      <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
        Raised by <strong>{d.raisedByName}</strong>
        {d.dueBy && isOpen && (
          <> · due by {new Date(d.dueBy).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: BUSINESS_TIMEZONE,
          })}</>
        )}
        {isResolved && d.resolvedByName && d.resolvedAt && (
          <> · {d.status === 'fixed' ? 'fixed' : 'waived'} by{' '}
            <strong>{d.resolvedByName}</strong> on{' '}
            {new Date(d.resolvedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              timeZone: BUSINESS_TIMEZONE,
            })}
          </>
        )}
      </div>
      {d.resolvedNote && (
        <p className="mt-1 text-xs italic text-neutral-600 dark:text-neutral-400">
          “{d.resolvedNote}”
        </p>
      )}
      {d.photos.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {d.photos.map((p) => (
            <a
              key={p.id}
              href={`/api/deficiency-photos/${p.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="relative block overflow-hidden rounded border border-neutral-200 dark:border-neutral-700"
              title={p.kind === 'before' ? 'Before' : 'After'}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/deficiency-photos/${p.id}`}
                alt=""
                loading="lazy"
                width={p.width}
                height={p.height}
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-[9px] uppercase tracking-wider text-white">
                {p.kind}
              </span>
            </a>
          ))}
        </div>
      )}
      {isOpen && canResolve && (
        <div className="mt-3 flex flex-col gap-2">
          {showResolve ? (
            <ResolveForm
              deficiencyId={d.id}
              onCancel={() => setShowResolve(false)}
            />
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowResolve(true)}
                className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                ✓ Mark fixed
              </button>
              {d.severity === 'cosmetic' && canWaive && (
                <form action={waiveDeficiency} className="inline">
                  <input type="hidden" name="id" value={d.id} />
                  <button
                    type="submit"
                    className="rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    Waive (cosmetic)
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ResolveForm({
  deficiencyId,
  onCancel,
}: {
  deficiencyId: string;
  onCancel: () => void;
}) {
  const [photoCount, setPhotoCount] = useState(0);
  return (
    <form
      action={resolveDeficiency}
      className="flex flex-col gap-2 rounded border border-emerald-400 bg-emerald-50/60 p-2 dark:border-emerald-700 dark:bg-emerald-950/30"
    >
      <input type="hidden" name="id" value={deficiencyId} />
      <input
        name="note"
        type="text"
        placeholder="Resolution note (optional)"
        className="rounded border border-emerald-300 bg-white p-2 text-sm dark:border-emerald-700 dark:bg-neutral-900"
      />
      <div>
        <label className="mb-1 block text-xs font-medium text-emerald-900 dark:text-emerald-200">
          After photos (optional)
        </label>
        <input
          name="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          multiple
          onChange={(e) => setPhotoCount(e.target.files?.length ?? 0)}
          className="block w-full text-sm"
        />
        {photoCount > 0 && (
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
            {photoCount} photo{photoCount === 1 ? '' : 's'} attached
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-neutral-600 underline-offset-2 hover:underline dark:text-neutral-400"
        >
          cancel
        </button>
        <ResolveButton />
      </div>
    </form>
  );
}

function ResolveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Confirm fix'}
    </button>
  );
}

function StatusPill({ status }: { status: DeficiencyForUI['status'] }) {
  const map: Record<DeficiencyForUI['status'], string> = {
    open: 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200',
    scheduled: 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    fixed: 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200',
    waived: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wider ${map[status]}`}>
      {status}
    </span>
  );
}
