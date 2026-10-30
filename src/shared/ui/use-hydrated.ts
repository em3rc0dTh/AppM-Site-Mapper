'use client';

import { useSyncExternalStore } from 'react';

function subscribeHydration(): () => void {
  return () => {};
}

function clientHydrated(): boolean {
  return true;
}

function serverHydrated(): boolean {
  return false;
}

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
}
