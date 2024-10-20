import { getLogger } from "../logger";

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
  log.debug(JSON.stringify({ query, options }));
  const syncTable = manager.client.sync_client.sync_table(query, options);
  log.debug("have our syncTable!", syncTable);
  throw Error("not implemented");
}
