'use client';

import { useEffect } from 'react';

export default function LocalProdBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const isLocalProd =
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === 'localhost';

    if (!isLocalProd || !('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => undefined);
  }, []);

  return null;
}
