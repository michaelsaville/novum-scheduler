'use client';

import { useEffect } from 'react';

export default function SwRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    // Register at root scope so the SW can intercept every navigation.
    // updateViaCache: 'none' tells the browser to bypass the HTTP cache when
    // checking sw.js itself — without it, edits would take 24h to propagate.
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => {});
  }, []);
  return null;
}
