/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux, useEffect, useMemo } from "@cocalc/frontend/app-framework";
import { useInterval } from "react-interval-hook";

export function useFileListingWatching(
  project_id: string,
  dir: string | undefined
): void {
  const project_actions = redux.getProjectActions(project_id);

  // once after mounting, when changing paths, and in regular intervals call watch()
  useEffect(watch, []);
  useMemo(watch, [dir]);
  useInterval(watch, 10 * 1000);

  function watch(): void {
    const store = project_actions.get_store();
    if (store == null) return;
    try {
      store.get_listings().watch("");
    } catch (err) {
      console.warn("ERROR watching directory", err);
    }
  }
}
