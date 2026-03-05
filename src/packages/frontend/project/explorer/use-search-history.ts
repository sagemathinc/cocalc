/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useCallback, useRef, useState } from "react";
import useAsyncEffect from "use-async-effect";

import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";

const DKV_NAME = "explorer-search-history";
const MAX_HISTORY = 100;

interface SearchHistoryDkv {
  get(key: string): unknown;
  set(key: string, value: string[]): void;
  close?(): void;
}

function normalizeHistoryValue(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return;
  }
  return normalized;
}

function sanitizeHistory(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const history: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const normalized = normalizeHistoryValue(item);
    if (normalized == null || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    history.push(normalized);
    if (history.length >= MAX_HISTORY) {
      break;
    }
  }
  return history;
}

export function useExplorerSearchHistory(project_id: string): {
  history: string[];
  initialized: boolean;
  addHistoryEntry: (value: string) => void;
} {
  const dkvRef = useRef<SearchHistoryDkv | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  const persist = useCallback(
    (next: string[]) => {
      try {
        dkvRef.current?.set(project_id, next);
      } catch {
        // DKV unavailable
      }
    },
    [project_id],
  );

  const addHistoryEntry = useCallback(
    (value: string) => {
      const normalized = normalizeHistoryValue(value);
      if (normalized == null) {
        return;
      }
      setHistory((prev) => {
        const next = [
          normalized,
          ...prev.filter((x) => x !== normalized),
        ].slice(0, MAX_HISTORY);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  useAsyncEffect(
    async (isMounted) => {
      const store = redux.getStore("account");
      await store.async_wait({
        until: () => store.get_account_id() != null,
        timeout: 0,
      });
      if (!isMounted()) {
        return;
      }

      try {
        const conatDkv = await webapp_client.conat_client.dkv<string[]>({
          account_id: store.get_account_id(),
          name: DKV_NAME,
        });
        if (!isMounted()) {
          conatDkv.close?.();
          return;
        }

        dkvRef.current = conatDkv as unknown as SearchHistoryDkv;
        const saved = sanitizeHistory(conatDkv.get(project_id));
        setHistory(saved);
        // Keep persisted value normalized.
        try {
          conatDkv.set(project_id, saved);
        } catch {
          // Ignore persistence errors on restore.
        }
      } catch {
        // DKV unavailable.
      } finally {
        if (isMounted()) {
          setInitialized(true);
        }
      }
    },
    () => {
      dkvRef.current?.close?.();
      dkvRef.current = null;
      setHistory([]);
      setInitialized(false);
    },
    [project_id],
  );

  return { history, initialized, addHistoryEntry };
}
