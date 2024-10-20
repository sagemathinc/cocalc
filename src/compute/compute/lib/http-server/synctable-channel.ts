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
  log.debug("synctableChannel ", query, options);
  console.log("synctableChannel", primus != null);
  const table = await manager.client.synctable_project(
    manager.project_id,
    query,
    options ?? [],
  );
  console.log("have our syncTable!", table.get()?.toJS());
  throw Error("not implemented");
}
