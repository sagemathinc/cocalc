/*
Manage listings table from the perspective of this compute server.
*/

import { registerListingsTable } from "@cocalc/sync/listings";
import getLogger from "@cocalc/backend/logger";
import { existsSync } from "fs";
import getListing0 from "@cocalc/backend/get-listing";
import { Watcher } from "@cocalc/backend/path-watcher";

const logger = getLogger("compute:listings");

export async function initListings({
  client,
  project_id,
  compute_server_id,
  home,
}: {
  client;
  project_id: string;
  compute_server_id: number;
  home: string;
}) {
  logger.debug("initListings", { project_id, compute_server_id });

  const table = await client.synctable_project(
    project_id,
    {
      listings: [
        {
          project_id,
          compute_server_id,
          path: null,
          listing: null,
          time: null,
          interest: null,
          missing: null,
          error: null,
          deleted: null,
        },
      ],
    },
    [],
  );

  const getListing = async (path: string, hidden: boolean) => {
    return await getListing0(path, hidden, home);
  };

  registerListingsTable({
    table,
    project_id,
    compute_server_id,
    getListing,
    createWatcher: (path: string, debounce: number) =>
      new Watcher(path, { debounce }),
    onDeletePath: (path) => {
      logger.debug("onDeletePath -- TODO:", { path });
    },
    existsSync,
    getLogger,
  });
}
