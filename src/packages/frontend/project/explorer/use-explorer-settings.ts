/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Per-project explorer settings persisted via Conat DKV.
 *
 * Automatically watches the Redux `active_file_sort` state and persists
 * changes to DKV. On mount, restores the last persisted sort state.
 * Works for both the large explorer and the flyout — any component that
 * changes `active_file_sort` via Redux will have its changes persisted.
 */

import { useEffect, useRef } from "react";
import useAsyncEffect from "use-async-effect";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";

interface ExplorerSettings {
  sortColumn?: string;
  sortDescending?: boolean;
}

const DKV_NAME = "explorer-settings";

export function useExplorerSettings(project_id: string): void {
  const dkvRef = useRef<any>(null);
  const initializedRef = useRef(false);

  // Watch Redux sort state for changes
  const activeFileSort = useTypedRedux({ project_id }, "active_file_sort");

  // Initialize DKV and restore persisted sort state
  useAsyncEffect(async () => {
    const store = redux.getStore("account");
    await store.async_wait({
      until: () => store.get_account_id() != null,
      timeout: 0,
    });
    const account_id = store.get_account_id();

    try {
      const conatDkv = await webapp_client.conat_client.dkv<ExplorerSettings>({
        account_id,
        name: DKV_NAME,
      });

      dkvRef.current = conatDkv;

      // Restore persisted sort state into Redux
      const saved: ExplorerSettings | undefined = conatDkv.get(project_id);
      if (saved?.sortColumn) {
        const actions = redux.getProjectActions(project_id);
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

      initializedRef.current = true;
    } catch (err) {
      console.warn("Failed to init explorer-settings DKV:", err);
      initializedRef.current = true;
    }
  }, [project_id]);

  // Auto-persist sort changes to DKV
  useEffect(() => {
    if (!initializedRef.current || !dkvRef.current || !activeFileSort) return;

    const columnName = activeFileSort.get("column_name");
    const isDescending = activeFileSort.get("is_descending");

    try {
      const current: ExplorerSettings = dkvRef.current.get(project_id) ?? {};
      // Only write if actually changed
      if (
        current.sortColumn !== columnName ||
        current.sortDescending !== isDescending
      ) {
        dkvRef.current.set(project_id, {
          ...current,
          sortColumn: columnName,
          sortDescending: isDescending,
        });
      }
    } catch (err) {
      console.warn("Failed to save sort settings:", err);
    }
  }, [activeFileSort, project_id]);
}
