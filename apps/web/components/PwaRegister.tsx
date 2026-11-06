'use client';

import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export default function PwaRegister() {
  const [isOffline, setIsOffline] = useState(false);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    // 1. Service Worker Registration
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => {
          // Successfully registered service worker
        })
        .catch(() => {
          // Service worker registration ignored if blocked by environment
        });
    }

    // 2. Connectivity Listeners
    const handleOffline = () => {
      setIsOffline(true);
      setShowRestored(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), 3500);
      return () => clearTimeout(timer);
    };

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('offline', handleOffline);
      window.addEventListener('online', handleOnline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('online', handleOnline);
      }
    };
  }, []);

  if (isOffline) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-xs font-bold animate-bounce tracking-wide border border-rose-400">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>Offline Mode &bull; Check Internet Connection</span>
      </div>
    );
  }

  if (showRestored) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-xs font-bold transition-all tracking-wide border border-emerald-400">
        <Wifi className="w-4 h-4 shrink-0" />
        <span>Connection Restored &bull; Back Online</span>
      </div>
    );
  }

  return null;
}
