/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  registerListingsTable as registerListingsTable0,
  getListingsTable,
} from "@cocalc/sync/listings";
import getListing from "@cocalc/backend/get-listing";
import { Watcher } from "@cocalc/backend/path-watcher";
import { close_all_syncdocs_in_tree } from "./sync-doc";
import { getLogger } from "@cocalc/backend/logger";
import { existsSync } from "fs";

const logger = getLogger("project:sync:listings");
const log = logger.debug;

export { getListingsTable };

export function registerListingsTable(table, query): void {
  log("registerListingsTables");
  log("registerListingsTables: query=", query);
  const onDeletePath = async (path) => {
    // Also we need to close *all* syncdocs that are going to be deleted,
    // and wait until closing is done before we return.
    await close_all_syncdocs_in_tree(path);
  };

  const createWatcher = (path: string, debounce: number) =>
    new Watcher(path, { debounce });

  const { project_id, compute_server_id } = query.listings[0];

  if (compute_server_id == 0) {
    log(
      "registerListingsTables -- actually registering since compute_server_id=0",
    );
    registerListingsTable0({
      table,
      project_id,
      compute_server_id,
      onDeletePath,
      getListing,
      createWatcher,
      existsSync,
      getLogger,
    });
  } else {
    log(
      "registerListingsTables -- NOT implemented since compute_server_id=",
      compute_server_id,
    );
  }
}
