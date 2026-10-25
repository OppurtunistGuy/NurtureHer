// Tracks editors with unsaved changes and asks once before anything would throw them away.
import { useEffect, useSyncExternalStore } from "react";

const dirty = new Map<symbol, string>();
type Pending = { labels: string[]; resolve: (discard: boolean) => void } | null;
let pending: Pending = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Registers an editor while it holds unsaved changes. */
export function useUnsavedChanges(isDirty: boolean, label: string) {
  useEffect(() => {
    if (!isDirty) return;
    const key = Symbol(label);
    dirty.set(key, label);
    return () => {
      dirty.delete(key);
    };
  }, [isDirty, label]);
}

export const hasUnsavedChanges = () => dirty.size > 0;

/**
 * Resolves true when it is safe to continue: nothing is unsaved, or the person chose Discard.
 * Resolves false when they chose Keep editing.
 */
export function confirmDiscard(): Promise<boolean> {
  if (!dirty.size) return Promise.resolve(true);
  if (pending) pending.resolve(false);
  return new Promise((resolve) => {
    pending = {
      labels: [...new Set(dirty.values())],
      resolve: (discard) => {
        pending = null;
        if (discard) dirty.clear();
        emit();
        resolve(discard);
      },
    };
    emit();
  });
}

export function useDiscardPrompt() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
    () => null,
  );
}
