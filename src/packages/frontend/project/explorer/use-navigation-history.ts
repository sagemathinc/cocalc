/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Browser-like back/forward navigation history for the file explorer
 * and flyout panels.
 *
 * Maintains an ordered history of visited directories with a cursor.
 * Persisted to Conat DKV so history survives page refreshes.
 *
 * Usage:
 *   const nav = useNavigationHistory(project_id, currentPath, onNavigate, "explorer");
 *   // nav.goBack(), nav.goForward(), nav.recordNavigation(path)
 *   // nav.canGoBack, nav.canGoForward
 *   // nav.backHistory, nav.forwardHistory  (for long-press dropdown)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import useAsyncEffect from "use-async-effect";

import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";

const MAX_HISTORY = 100;
const DKV_NAME = "explorer-nav-history";

interface PersistedState {
  history: string[];
  cursor: number;
}

interface NavDKV {
  get(key: string): PersistedState | undefined;
  set(key: string, value: PersistedState): void;
  close?(): void;
}

export interface NavigationHistory {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  /** Record a new navigation (not via back/forward). */
  recordNavigation: (path: string) => void;
  /** History entries behind the cursor (for back-button long-press dropdown). */
  backHistory: string[];
  /** History entries ahead of the cursor (for forward-button long-press dropdown). */
  forwardHistory: string[];
}

/**
 * Push `path` to the front of `history`, dedup, truncate to MAX_HISTORY.
 * When `cursor > 0` (user went back), truncate forward entries first.
 */
function pushToHistory(
  history: string[],
  cursor: number,
  path: string,
): { history: string[]; cursor: number } {
  // If we're not at the front, discard the "forward" entries
  let base = cursor > 0 ? history.slice(cursor) : [...history];

  // Remove any existing occurrence of the new path (dedup)
  base = base.filter((p) => p !== path);

  // Push to front
  base.unshift(path);

  // Truncate
  if (base.length > MAX_HISTORY) {
    base.length = MAX_HISTORY;
  }

  return { history: base, cursor: 0 };
}

export function useNavigationHistory(
  project_id: string,
  currentPath: string,
  onNavigate: (path: string) => void,
  storageKey: "explorer" | "flyout",
): NavigationHistory {
  const dkvKey = `${storageKey}:${project_id}`;
  const dkvRef = useRef<NavDKV | null>(null);
  // Reactive flag so the reconciliation effect re-runs after DKV init.
  const [initialized, setInitialized] = useState(false);
  // Track whether a navigation was triggered by goBack/goForward
  // so recordNavigation can skip recording it.
  const isBackForwardRef = useRef(false);

  const [history, setHistory] = useState<string[]>([currentPath]);
  const [cursor, setCursor] = useState(0);

  // Persist current state to DKV (debounced by React batching)
  const persist = useCallback(
    (h: string[], c: number) => {
      try {
        dkvRef.current?.set(dkvKey, { history: h, cursor: c });
      } catch {
        // DKV unavailable
      }
    },
    [dkvKey],
  );

  // Initialize from DKV on mount
  useAsyncEffect(
    async (isMounted) => {
      const store = redux.getStore("account");
      await store.async_wait({
        until: () => store.get_account_id() != null,
        timeout: 0,
      });
      if (!isMounted()) return;

      const account_id = store.get_account_id();
      try {
        const conatDkv = await webapp_client.conat_client.dkv<PersistedState>({
          account_id,
          name: DKV_NAME,
        });
        if (!isMounted()) {
          conatDkv.close?.();
          return;
        }

        dkvRef.current = conatDkv as unknown as NavDKV;

        const saved = conatDkv.get(dkvKey);
        if (saved?.history && saved.history.length > 0) {
          // Restore saved history, but reconcile: if currentPath
          // differs from the saved front entry (user navigated before
          // DKV loaded), push currentPath onto the restored history.
          // Note: any intermediate navigations that occurred before DKV
          // loaded are not merged — only the current path at the moment
          // DKV loads is reconciled.  This is acceptable because DKV
          // typically loads within seconds and nav history is non-vital.
          let h = saved.history;
          let c = saved.cursor ?? 0;
          if (h[c] !== currentPath) {
            const merged = pushToHistory(h, c, currentPath);
            h = merged.history;
            c = merged.cursor;
            // Persist the reconciled state
            try {
              conatDkv.set(dkvKey, { history: h, cursor: c } as any);
            } catch {
              // ignore
            }
          }
          setHistory(h);
          setCursor(c);
        }

        setInitialized(true);
      } catch {
        // DKV unavailable — navigation history won't persist
        setInitialized(true);
      }
    },
    () => {
      dkvRef.current?.close?.();
      dkvRef.current = null;
      setInitialized(false);
    },
    [project_id, storageKey],
  );

  // When currentPath changes from outside (not via back/forward),
  // record it in history.  Also re-runs when `initialized` flips to true
  // so any navigation that occurred before DKV loaded gets recorded.
  useEffect(() => {
    if (!initialized) return;
    if (isBackForwardRef.current) {
      isBackForwardRef.current = false;
      return;
    }
    // Don't record if we're already at this path
    if (history[cursor] === currentPath) return;

    const next = pushToHistory(history, cursor, currentPath);
    setHistory(next.history);
    setCursor(next.cursor);
    persist(next.history, next.cursor);
  }, [currentPath, initialized]);

  const canGoBack = cursor < history.length - 1;
  const canGoForward = cursor > 0;

  const goBack = useCallback(() => {
    if (cursor >= history.length - 1) return;
    const newCursor = cursor + 1;
    setCursor(newCursor);
    persist(history, newCursor);
    isBackForwardRef.current = true;
    onNavigate(history[newCursor]);
  }, [cursor, history, onNavigate, persist]);

  const goForward = useCallback(() => {
    if (cursor <= 0) return;
    const newCursor = cursor - 1;
    setCursor(newCursor);
    persist(history, newCursor);
    isBackForwardRef.current = true;
    onNavigate(history[newCursor]);
  }, [cursor, history, onNavigate, persist]);

  const recordNavigation = useCallback(
    (path: string) => {
      const next = pushToHistory(history, cursor, path);
      setHistory(next.history);
      setCursor(next.cursor);
      persist(next.history, next.cursor);
    },
    [history, cursor, persist],
  );

  // Entries behind the cursor (for the back long-press dropdown)
  const backHistory = history.slice(cursor + 1);
  // Entries ahead of the cursor (for the forward long-press dropdown)
  const forwardHistory = cursor > 0 ? history.slice(0, cursor).reverse() : [];

  return {
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    recordNavigation,
    backHistory,
    forwardHistory,
  };
}
