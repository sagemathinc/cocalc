/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Per-project explorer settings persisted via Conat DKV.
 *
 * `useSettingsDKV` is the shared lifecycle hook that manages account-ready
 * wait, DKV open/close, dirty detection, and restore.  The two public
 * hooks — `useExplorerSettings` and `useFlyoutSettings` — add their own
 * restore logic and auto-persist effects on top.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import useAsyncEffect from "use-async-effect";

import { TypedMap, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";

import type { ActiveFileSort } from "@cocalc/frontend/project/page/flyouts/files";

interface ExplorerSettings {
  sortColumn?: string;
  sortDescending?: boolean;
  showDirectoryTree?: boolean;
  // Flyout-specific sort (independent of the explorer)
  flyoutSortColumn?: string;
  flyoutSortDescending?: boolean;
}

/** Narrow interface for the DKV store used by both hooks. */
interface SettingsDKV {
  get(key: string): ExplorerSettings | undefined;
  set(key: string, value: ExplorerSettings): void;
  close?(): void;
}

const DKV_NAME = "explorer-settings";

// ---------------------------------------------------------------------------
// Shared DKV lifecycle hook
// ---------------------------------------------------------------------------

interface UseSettingsDKVResult {
  dkvRef: React.MutableRefObject<SettingsDKV | null>;
  initializedRef: React.MutableRefObject<boolean>;
  /**
   * Pass as a `useEffect` callback whose dependency list includes the
   * watched values.  On the first call (mount) it is a no-op; on
   * subsequent calls before DKV init it sets the dirty flag so the
   * restore is skipped.
   */
  markDirtyBeforeInit: () => void;
}

/**
 * Shared DKV lifecycle for per-project explorer/flyout settings.
 *
 * Opens a reference-counted DKV connection (via Conat), waits for the
 * account store, handles `isMounted` guards, and cleans up on unmount.
 * When the store is ready it calls `onRestore` with the saved settings
 * — unless the user already interacted (dirty).
 */
function useSettingsDKV(
  project_id: string,
  onRestore: ((saved: ExplorerSettings | undefined) => void) | null,
): UseSettingsDKVResult {
  const dkvRef = useRef<SettingsDKV | null>(null);
  const initializedRef = useRef(false);
  const dirtyRef = useRef(false);
  const firstRenderRef = useRef(true);

  // Keep a ref to onRestore so the async init always calls the latest version.
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  const markDirtyBeforeInit = useCallback(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (!initializedRef.current) {
      dirtyRef.current = true;
    }
  }, []);

  useAsyncEffect(
    async (isMounted) => {
      const account = redux.getStore("account");
      const ready = await account.waitUntilReady();
      if (!ready || !isMounted()) return;

      const account_id = account.get_account_id();

      try {
        const conatDkv = await webapp_client.conat_client.dkv<ExplorerSettings>(
          {
            account_id,
            name: DKV_NAME,
          },
        );
        if (!isMounted()) {
          conatDkv.close?.();
          return;
        }

        dkvRef.current = conatDkv as unknown as SettingsDKV;

        if (!dirtyRef.current) {
          onRestoreRef.current?.(conatDkv.get(project_id));
        }

        initializedRef.current = true;
      } catch {
        initializedRef.current = true;
      }
    },
    () => {
      dkvRef.current?.close?.();
      dkvRef.current = null;
      initializedRef.current = false;
      dirtyRef.current = false;
      firstRenderRef.current = true;
    },
    [project_id],
  );

  return { dkvRef, initializedRef, markDirtyBeforeInit };
}

// ---------------------------------------------------------------------------
// Explorer settings (sort column, sort direction, directory tree toggle)
// ---------------------------------------------------------------------------

export function useExplorerSettings(project_id: string): void {
  const activeFileSort = useTypedRedux({ project_id }, "active_file_sort");
  const showDirectoryTree = useTypedRedux(
    { project_id },
    "show_directory_tree",
  );

  const { dkvRef, initializedRef, markDirtyBeforeInit } = useSettingsDKV(
    project_id,
    (saved) => {
      const actions = redux.getProjectActions(project_id);
      if (saved?.sortColumn) {
        const currentSort = redux
          .getProjectStore(project_id)
          ?.get("active_file_sort");
        if (currentSort) {
          actions.setState({
            active_file_sort: currentSort
              .set("column_name", saved.sortColumn)
              .set("is_descending", saved.sortDescending ?? false),
          });
        }
      }
      if (saved?.showDirectoryTree != null) {
        actions.setState({
          show_directory_tree: saved.showDirectoryTree,
        });
      }
    },
  );

  // Detect user changes before DKV initialization completes.
  useEffect(markDirtyBeforeInit, [
    markDirtyBeforeInit,
    activeFileSort,
    showDirectoryTree,
  ]);

  // Auto-persist explorer settings changes to DKV.
  useEffect(() => {
    if (!initializedRef.current || !dkvRef.current || !activeFileSort) return;

    const columnName = activeFileSort.get("column_name");
    const isDescending = activeFileSort.get("is_descending");

    try {
      const current: ExplorerSettings = dkvRef.current.get(project_id) ?? {};
      if (
        current.sortColumn !== columnName ||
        current.sortDescending !== isDescending ||
        current.showDirectoryTree !== showDirectoryTree
      ) {
        dkvRef.current.set(project_id, {
          ...current,
          sortColumn: columnName,
          sortDescending: isDescending,
          showDirectoryTree,
        });
      }
    } catch {
      // DKV unavailable — silently skip persistence.
    }
  }, [activeFileSort, project_id, showDirectoryTree]);
}

// ---------------------------------------------------------------------------
// Flyout sort settings (independent sort column + direction)
// ---------------------------------------------------------------------------

const DEFAULT_FLYOUT_SORT: ActiveFileSort = TypedMap({
  column_name: "time",
  is_descending: false,
});

/**
 * Per-project flyout sort order persisted via Conat DKV.
 *
 * Returns `[activeFileSort, setActiveFileSort]` backed by the same
 * DKV store as the explorer settings, but using `flyoutSortColumn` /
 * `flyoutSortDescending` fields so the two panels stay independent.
 */
export function useFlyoutSettings(
  project_id: string,
): [ActiveFileSort, React.Dispatch<React.SetStateAction<ActiveFileSort>>] {
  const [flyoutSort, setFlyoutSort] =
    useState<ActiveFileSort>(DEFAULT_FLYOUT_SORT);

  const { dkvRef, initializedRef, markDirtyBeforeInit } = useSettingsDKV(
    project_id,
    (saved) => {
      if (saved?.flyoutSortColumn) {
        setFlyoutSort(
          TypedMap({
            column_name: saved.flyoutSortColumn,
            is_descending: saved.flyoutSortDescending ?? false,
          }),
        );
      }
    },
  );

  // Detect user changes before DKV initialization completes.
  useEffect(markDirtyBeforeInit, [markDirtyBeforeInit, flyoutSort]);

  // Auto-persist flyout sort changes to DKV.
  useEffect(() => {
    if (!initializedRef.current || !dkvRef.current || !flyoutSort) return;

    const col = flyoutSort.get("column_name");
    const desc = flyoutSort.get("is_descending");

    try {
      const current: ExplorerSettings = dkvRef.current.get(project_id) ?? {};
      if (
        current.flyoutSortColumn !== col ||
        current.flyoutSortDescending !== desc
      ) {
        dkvRef.current.set(project_id, {
          ...current,
          flyoutSortColumn: col,
          flyoutSortDescending: desc,
        });
      }
    } catch {
      // DKV unavailable — silently skip persistence.
    }
  }, [flyoutSort, project_id]);

  return [flyoutSort, setFlyoutSort];
}
