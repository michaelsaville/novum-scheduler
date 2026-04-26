'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'novum.install-hint.dismissed';

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPad on iPadOS 13+ reports as Mac — pick that up via touch + Safari UA.
  const iosLike =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
  if (!iosLike) return false;
  // Exclude in-app browsers that don't expose Add-to-Home-Screen
  // (FB/IG webviews, Chrome/Firefox on iOS — they all wrap WebKit but the
  // share→install flow there points at Safari, not the embedded browser).
  if (/CriOS|FxiOS|EdgiOS|GSA|FBAN|FBAV|Instagram|Line/.test(ua)) return false;
  return /Safari/.test(ua);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export default function InstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIosSafari() || isStandalone()) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {}
    setShow(true);
  }, []);

  function dismiss() {
    setShow(false);
    try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch {}
  }

  if (!show) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md p-3 supports-[padding:max(0px)]:pb-[max(env(safe-area-inset-bottom),0.75rem)]"
    >
      <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
        <span aria-hidden className="text-xl leading-none">📱</span>
        <div className="flex-1 text-sm">
          <p className="font-medium">Install Novum on your phone</p>
          <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
            Tap <span aria-hidden>⬆️</span> Share, then <strong>Add to Home Screen</strong> for a faster
            launch and push notifications.
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="-mt-1 -mr-1 inline-flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
        >
          <span aria-hidden className="text-lg leading-none">×</span>
        </button>
      </div>
    </div>
  );
}
