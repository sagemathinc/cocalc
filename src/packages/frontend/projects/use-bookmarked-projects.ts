/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
// To debug bookmarked projects in the browser console:
c = cc.client.conat_client
bm = await c.dkv({account_id: cc.client.account_id, name: 'bookmarks'})
// Check all bookmark data
console.log('All bookmarks:', bm.getAll())
// Check bookmarked projects
console.log('Bookmarked projects:', bm.get("projects"))
// Set bookmarked projects
bm.set("projects", ['project_id_1', 'project_id_2'])
// Listen to changes
bm.on('change', (e) => console.log('Bookmark change:', e))
 */

import { sortBy, uniq } from "lodash";
import { useEffect, useRef, useState } from "react";

import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";

const CONAT_BOOKMARKS_KEY = "bookmarks";
const PROJECTS_KEY = "projects";

export type BookmarkedProjects = string[]; // array of project UUIDs

// Bookmarked projects are now managed entirely through conat with in-memory state.
// No local storage dependency - conat handles synchronization and persistence.
export function useBookmarkedProjects() {
  const [bookmarkedProjects, setBookmarkedProjects] =
    useState<BookmarkedProjects>([]);
  const [bookmarks, setBookmarks] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Use ref to store stable listener function
  const listenerRef = useRef<
    | ((changeEvent: {
        key: string;
        value?: Record<string, any>;
        prev?: Record<string, any>;
      }) => void)
    | null
  >(null);

  // Initialize conat bookmarks and set up listeners
  useEffect(() => {
    let isMounted = true;
    let conatBookmarks: any = null;

    const initializeConatBookmarks = async () => {
      try {
        // Wait until account is authenticated
        const store = redux.getStore("account");
        await store.async_wait({
          until: () => store.get_account_id() != null,
          timeout: 0, // indefinite timeout
        });

        const account_id = store.get_account_id();
        conatBookmarks = await webapp_client.conat_client.dkv<
          Record<string, any>
        >({
          account_id,
          name: CONAT_BOOKMARKS_KEY,
        });

        // Check if component was unmounted while we were waiting
        if (!isMounted) {
          return;
        }

        setBookmarks(conatBookmarks);

        // Load initial data from conat
        const initialBookmarks = conatBookmarks.get(PROJECTS_KEY) ?? [];
        if (Array.isArray(initialBookmarks)) {
          setBookmarkedProjects(sortBy(uniq(initialBookmarks)));
        }

        // Create stable listener function
        listenerRef.current = (changeEvent: {
          key: string;
          value?: Record<string, any>;
          prev?: Record<string, any>;
        }) => {
          if (changeEvent.key === PROJECTS_KEY) {
            const remoteBookmarks =
              (changeEvent.value as BookmarkedProjects) ?? [];
            setBookmarkedProjects(sortBy(uniq(remoteBookmarks)));
          }
        };

        // Add our listener to the conat bookmarks
        conatBookmarks.on("change", listenerRef.current);

        setIsInitialized(true);
      } catch (err) {
        console.warn(`conat bookmark initialization warning -- ${err}`);
        if (isMounted) {
          setIsInitialized(true); // Set initialized even on error to avoid infinite loading
        }
      }
    };

    initializeConatBookmarks();

    // Cleanup function for useEffect
    return () => {
      isMounted = false;
      if (conatBookmarks && listenerRef.current) {
        conatBookmarks.off("change", listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, []);

  function setProjectBookmarked(project_id: string, bookmarked: boolean) {
    if (!bookmarks || !isInitialized) {
      console.warn("Conat bookmarks not yet initialized");
      return;
    }

    const next = bookmarked
      ? sortBy(uniq([...bookmarkedProjects, project_id]))
      : bookmarkedProjects.filter((p) => p !== project_id);

    // Update local state immediately for responsive UI
    setBookmarkedProjects(next);

    // Store to conat (this will also trigger the change event for other clients)
    try {
      bookmarks.set(PROJECTS_KEY, next);
    } catch (err) {
      console.warn(`conat bookmark storage warning -- ${err}`);
      // Revert local state on error
      setBookmarkedProjects(bookmarkedProjects);
    }
  }

  function isProjectBookmarked(project_id: string): boolean {
    return bookmarkedProjects.includes(project_id);
  }

  return {
    bookmarkedProjects,
    setProjectBookmarked,
    isProjectBookmarked,
    isInitialized,
  };
}
