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

import { useCallback } from "react";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { navigateBrowsingPath } from "@cocalc/frontend/project/explorer/navigate-browsing-path";
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
  const reduxCurrentPath = useTypedRedux({ project_id }, "current_path") ?? "";
  const flyoutBrowsingPath = useTypedRedux(
    { project_id },
    "flyout_browsing_path",
  );
  const flyoutHistoryPath = useTypedRedux(
    { project_id },
    "flyout_history_path",
  );

  const flyoutPath = flyoutBrowsingPath ?? reduxCurrentPath;
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
  const navigateFlyout = useCallback(
    (path: string) => {
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
