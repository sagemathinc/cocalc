/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  registerListingsTable as registerListingsTable0,
  getListingsTable,
} from "@cocalc/sync/listings";
import getListing from "@cocalc/backend/get-listing";
import { Watcher } from "./path-watcher";
import { close_all_syncdocs_in_tree } from "./sync-doc";
import { removeJupyterRedux } from "@cocalc/jupyter/kernel";
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("project:sync:listings");
const log = logger.debug;

export { getListingsTable };

export function registerListingsTable(table, project_id): void {
  log("registerListingsTables");
  const onDeletePath = async (path) => {
    // Also we need to close *all* syncdocs that are going to be deleted,
    // and wait until closing is done before we return.
    await close_all_syncdocs_in_tree(path);
    // If it is a Jupyter kernel, close that too
    if (path.endsWith(".ipynb")) {
      log("setDeleted: handling jupyter kernel for", path);
      await removeJupyterRedux(path, project_id);
    }
  };

  const createWatcher = (path: string, debounceMs: number) =>
    new Watcher(path, debounceMs);

  registerListingsTable0({
    table,
    project_id,
    compute_server_id: 0,
    onDeletePath,
    getListing,
    createWatcher,
  });
}
