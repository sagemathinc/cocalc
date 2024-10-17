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
  throw Error("not implemented");
}
