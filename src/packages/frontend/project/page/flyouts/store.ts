/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
// To debug starred files in the browser console:
c = cc.client.conat_client
bm = await c.dkv({account_id: cc.client.account_id, name: 'bookmark-starred-files'})
// Check all bookmark data
console.log('All bookmarks:', bm.getAll())
// Check specific project bookmarks
console.log('Project bookmarks (get):', bm.get("[project_id]"))
// Set starred files for a project
bm.set(project_id, ['file1.txt', 'folder/file2.md'])
// Listen to changes
bm.on('change', (e) => console.log('Bookmark change:', e))
 */

import { sortBy, uniq } from "lodash";
import { useState } from "react";
import useAsyncEffect from "use-async-effect";

import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { CONAT_BOOKMARKS_KEY } from "@cocalc/util/consts/bookmarks";
import type { FlyoutActiveStarred } from "./state";

// Starred files are now managed entirely through conat with in-memory state.
// No local storage dependency - conat handles synchronization and persistence.
export function useStarredFilesManager(project_id: string, enabled: boolean = true) {
  const [starred, setStarred] = useState<FlyoutActiveStarred>([]);
  const [bookmarks, setBookmarks] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize conat bookmarks once on mount, waiting for authentication
  useAsyncEffect(async () => {
    if (!enabled) {
      setIsInitialized(true);
      return;
    }

    // Wait until account is authenticated
    const store = redux.getStore("account");
    await store.async_wait({
      until: () => store.get_account_id() != null,
      timeout: 0, // indefinite timeout
    });

    const account_id = store.get_account_id();
    await initializeConatBookmarks(account_id);
  }, [enabled]);

  async function initializeConatBookmarks(account_id: string) {
    try {
      const conatBookmarks = await webapp_client.conat_client.dkv<string[]>({
        account_id,
        name: CONAT_BOOKMARKS_KEY,
      });

      setBookmarks(conatBookmarks);

      // Listen for changes from other clients
      conatBookmarks.on(
        "change",
        (changeEvent: { key: string; value?: string[]; prev?: string[] }) => {
          if (changeEvent.key === project_id) {
            const remoteStars = changeEvent.value || [];
            setStarred(sortBy(uniq(remoteStars)));
          }
        },
      );

      // Load initial data from conat
      const initialStars = conatBookmarks.get(project_id) || [];
      if (Array.isArray(initialStars)) {
        setStarred(sortBy(uniq(initialStars)));
      }

      setIsInitialized(true);
    } catch (err) {
      console.warn(`conat bookmark initialization warning -- ${err}`);
      setIsInitialized(true); // Set initialized even on error to avoid infinite loading
    }
  }

  function setStarredPath(path: string, starState: boolean) {
    if (!bookmarks || !isInitialized) {
      console.warn("Conat bookmarks not yet initialized");
      return;
    }

    const next = starState
      ? sortBy(uniq([...starred, path]))
      : starred.filter((p) => p !== path);

    // Update local state immediately for responsive UI
    setStarred(next);

    // Store to conat (this will also trigger the change event for other clients)
    try {
      bookmarks.set(project_id, next);
    } catch (err) {
      console.warn(`conat bookmark storage warning -- ${err}`);
      // Revert local state on error
      setStarred(starred);
    }
  }

  return {
    starred,
    setStarredPath,
  };
}
