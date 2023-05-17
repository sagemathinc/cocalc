/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  useActions,
  useEffect,
  useMemo,
  usePrevious,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { watchFiles } from "@cocalc/frontend/project/explorer/file-listing/file-listing";
import { ListingItem } from "@cocalc/frontend/project/explorer/types";
import { WATCH_THROTTLE_MS } from "@cocalc/frontend/project/websocket/listings";
import { useInterval } from "react-interval-hook";

export function FilesFlyout({ project_id, wrap }) {
  const actions = useActions({ project_id });
  const current_path = useTypedRedux({ project_id }, "current_path");
  const displayed_listing:
    | {
        listing: ListingItem[];
        error: any;
        file_map: Map<string, any>;
      }
    | undefined = useTypedRedux({ project_id }, "displayed_listing");

  const prev_current_path = usePrevious(current_path);

  function watch() {
    actions?.fetch_directory_listing();
    watchFiles({ actions, current_path });
  }

  // this is copied from file-listing/file-listing.tsx
  // once after mounting, when changing paths, and in regular intervals call watch()
  useEffect(() => {
    watch();
  }, []);

  useEffect(() => {
    if (current_path != prev_current_path) {
      watch();
    }
  }, [current_path, prev_current_path]);

  useInterval(watch, WATCH_THROTTLE_MS);

  const listing2 = useMemo(() => {
    return actions?.get_store()?.get_listings()?.get(current_path);
  }, [current_path]);

  const data = (
    <pre>
      {JSON.stringify(
        {
          project_id,
          current_path,
          listing2,
          listing: displayed_listing?.listing,
        },
        null,
        2
      )}
    </pre>
  );

  return <>{wrap(data)}</>;
}
