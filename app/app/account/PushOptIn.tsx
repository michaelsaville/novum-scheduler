'use client';

import { useEffect, useState } from 'react';

type Status = 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed' | 'loading' | 'error';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export default function PushOptIn({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    if (!vapidPublicKey) {
      setStatus('error');
      setMessage('Server is missing VAPID public key.');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        setStatus(existing ? 'subscribed' : 'unsubscribed');
      } catch (e) {
        setStatus('error');
        setMessage(String(e));
      }
    })();
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setStatus('loading');
    setMessage(null);
    try {
      if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          setStatus(perm === 'denied' ? 'denied' : 'unsubscribed');
          return;
        }
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
      setStatus('subscribed');
    } catch (e) {
      setStatus('error');
      setMessage(String(e));
    }
  }

  async function disable() {
    setStatus('loading');
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        }).catch(() => {});
        await existing.unsubscribe();
      }
      setStatus('unsubscribed');
    } catch (e) {
      setStatus('error');
      setMessage(String(e));
    }
  }

  if (status === 'unsupported') {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        This browser doesn&apos;t support push notifications. On iPhone, install
        the app first (Share → Add to Home Screen) to enable push on iOS 16.4+.
      </p>
    );
  }
  if (status === 'denied') {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Notifications are blocked. Enable them in your browser&apos;s site
        settings, then reload this page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Get a phone notification when a scheduler assigns you a new task.
      </p>
      {status === 'subscribed' ? (
        <button
          type="button"
          onClick={disable}
          className="self-start rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
        >
          Disable on this device
        </button>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={status === 'loading'}
          className="self-start rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {status === 'loading' ? 'Working…' : 'Enable on this device'}
        </button>
      )}
      {message && (
        <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {message}
        </p>
      )}
    </div>
  );
}
