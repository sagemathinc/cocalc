import { getLogger } from "../logger";
import { synctable_channel } from "@cocalc/sync-server/server/server";

const log = getLogger("synctable-channel");

export default async function synctableChannel({
  manager,
  query,
  options,
  primus,
}: {
  manager;
  query;
  options;
  primus;
}) {
  log.debug("synctableChannel ", query, options);
  return await synctable_channel(manager.client, primus, log, query, options);
}
