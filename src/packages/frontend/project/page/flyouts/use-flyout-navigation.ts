/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Hook for the flyout's independent browsing path with back/forward history.
 *
 * Both the flyout header (PathNavigator breadcrumb) and the flyout body
 * (file listing) need access to the flyout's browsing path and a
 * `navigate` function.  This hook reads/writes the Redux keys
 * `flyout_browsing_path` and `flyout_history_path` so that the two
 * sibling components stay in sync.
 */

import { useCallback, useEffect } from "react";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  getInitialBrowsingPath,
  navigateBrowsingPath,
  normalizeDotDot,
} from "@cocalc/frontend/project/explorer/navigate-browsing-path";
import {
  useNavigationHistory,
  type NavigationHistory,
} from "@cocalc/frontend/project/explorer/use-navigation-history";

interface FlyoutNavigation extends NavigationHistory {
  /** Directory the flyout is currently showing. */
  flyoutPath: string;
  /** History path for breadcrumb depth. */
  flyoutHistory: string;
  /** Navigate the flyout to a different directory (records history). */
  navigateFlyout: (path: string) => void;
}

export function useFlyoutNavigation(project_id: string): FlyoutNavigation {
  const flyoutBrowsingPath = useTypedRedux(
    { project_id },
    "flyout_browsing_path",
  );
  const flyoutHistoryPath = useTypedRedux(
    { project_id },
    "flyout_history_path",
  );

  const reduxCurrentPath = useTypedRedux({ project_id }, "current_path") ?? "";

  // Initialize on first mount.  When "follow current path" is on,
  // start at the active file's directory; when off, restore from
  // localStorage (falling back to project root).
  useEffect(() => {
    if (flyoutBrowsingPath != null) return;
    let cancelled = false;
    (async () => {
      const accountStore = redux.getStore("account");
      await accountStore?.waitUntilReady();
      // Guard against race: if the user navigated (or another effect ran)
      // while we waited, the path is no longer null — don't overwrite.
      if (cancelled) return;
      const store = redux.getProjectStore(project_id);
      if (store?.get("flyout_browsing_path") != null) return;
      const followSetting = !!accountStore?.getIn([
        "other_settings",
        "follow_current_path",
      ]);
      const initial = followSetting
        ? reduxCurrentPath
        : getInitialBrowsingPath(project_id, "flyout_browsing_path");
      const actions = redux.getProjectActions(project_id);
      actions?.setState({
        flyout_browsing_path: initial,
        flyout_history_path: initial,
      } as any);
      // Trigger a listing fetch so the restored directory isn't empty.
      actions?.fetch_directory_listing({ path: initial });
      try {
        store?.get_listings()?.watch(initial, true);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flyoutPath = flyoutBrowsingPath ?? "";
  const flyoutHistory = flyoutHistoryPath ?? flyoutPath;

  const navigateFlyoutRaw = useCallback(
    (path: string) => {
      navigateBrowsingPath(
        project_id,
        path,
        flyoutHistory,
        "flyout_browsing_path",
        "flyout_history_path",
      );
    },
    [project_id, flyoutHistory],
  );

  const navHistory = useNavigationHistory(
    project_id,
    flyoutPath,
    navigateFlyoutRaw,
    "flyout",
  );

  // Wrap navigation so every explicit navigation records history.
  // Normalize the path first so history records the resolved form
  // (e.g. "a/b/.." → "a"), matching what navigateBrowsingPath stores.
  const navigateFlyout = useCallback(
    (rawPath: string) => {
      const path = normalizeDotDot(rawPath.replace(/\/+$/, ""));
      navigateFlyoutRaw(path);
      navHistory.recordNavigation(path);
    },
    [navigateFlyoutRaw, navHistory.recordNavigation],
  );

  return {
    flyoutPath,
    flyoutHistory,
    navigateFlyout,
    ...navHistory,
  };
}
