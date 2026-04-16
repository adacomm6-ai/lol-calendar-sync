'use client';

import { useEffect } from 'react';

const LOCAL_PROD_CACHE_RESET_KEY = 'lolhp-local-prod-cache-reset-active';
const LOCAL_PROD_CACHE_DONE_KEY = 'lolhp-local-prod-cache-reset-complete-v2';

export default function LocalProdBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const isLocalProd =
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === 'localhost';

    if (!isLocalProd) {
      return;
    }

    try {
      if (window.localStorage.getItem(LOCAL_PROD_CACHE_DONE_KEY) === '1') {
        return;
      }
    } catch {
      // Ignore localStorage failures and fall back to session-only guard.
    }

    try {
      if (window.sessionStorage.getItem(LOCAL_PROD_CACHE_RESET_KEY) === '1') {
        window.sessionStorage.removeItem(LOCAL_PROD_CACHE_RESET_KEY);
        window.localStorage.setItem(LOCAL_PROD_CACHE_DONE_KEY, '1');
        return;
      }
    } catch {
      // Ignore storage failures and continue with cleanup.
    }

    let cancelled = false;

    const cleanupLocalCaches = async () => {
      let changed = false;

      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          const unregisterResults = await Promise.all(
            registrations.map((registration) => registration.unregister().catch(() => false))
          );
          changed = changed || unregisterResults.some(Boolean);
        } catch {
          // Ignore cleanup failures in local prod bootstrap.
        }
      }

      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          if (keys.length > 0) {
            const deleteResults = await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
            changed = changed || deleteResults.some(Boolean);
          }
        } catch {
          // Ignore cache deletion failures in local prod bootstrap.
        }
      }

      if (cancelled || !changed) {
        try {
          window.localStorage.setItem(LOCAL_PROD_CACHE_DONE_KEY, '1');
        } catch {
          // Ignore localStorage failures in local prod bootstrap.
        }
        return;
      }

      try {
        window.sessionStorage.setItem(LOCAL_PROD_CACHE_RESET_KEY, '1');
      } catch {
        // Ignore storage failures and still perform the single reload.
      }
      window.location.reload();
    };

    cleanupLocalCaches();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
