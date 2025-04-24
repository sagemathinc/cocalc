/*
Our tiered storage code as a server on the nats network.

DEVELOPMENT:

> a = require('@cocalc/server/nats/tiered-storage'); a.init()

or

    echo "require('@cocalc/server/nats/tiered-storage').init()" | node


In another terminal:

> require('@cocalc/backend/nats'); c = require('@cocalc/nats/tiered-storage/client')
{
  state: [AsyncFunction: state],
  restore: [AsyncFunction: restore],
  archive: [AsyncFunction: archive],
  backup: [AsyncFunction: backup],
  info: [AsyncFunction: info]
}
> await c.info({project_id:'27cf0030-a9c8-4168-bc03-d0efb3d2269e'})
{
  subject: 'tiered-storage.project-27cf0030-a9c8-4168-bc03-d0efb3d2269e.api'
}
*/

import {
  type TieredStorage as TieredStorageInterface,
  type State,
  type Info,
  init as initServer,
  terminate,
} from "@cocalc/nats/tiered-storage/server";
import { type Location } from "@cocalc/nats/types";
import { type LocationType } from "./types";
import { backupProject, backupAccount } from "./backup";
import { restoreProject, restoreAccount } from "./restore";
import { archiveProject, archiveAccount } from "./archive";
import { getProjectState, getAccountState } from "./state";
import { getProjectInfo, getAccountInfo } from "./info";
import { isValidUUID } from "@cocalc/util/misc";
import "@cocalc/backend/nats";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("tiered-storage:api");

export { terminate };

export async function init() {
  logger.debug("init");
  const ts = new TieredStorage();
  initServer(ts);
}

function getType({ account_id, project_id }: Location): LocationType {
  if (account_id) {
    if (project_id) {
      throw Error(
        "exactly one of account_id or project_id may be specified but both are",
      );
    }
    if (!isValidUUID(account_id)) {
      throw Error("account_id must be a valid uuid");
    }
    return "account";
  } else if (project_id) {
    if (!isValidUUID(project_id)) {
      throw Error("project_id must be a valid uuid");
    }
    return "project";
  } else {
    throw Error(
      "exactly one of account_id or project_id may be specified but neither are",
    );
  }
}

class TieredStorage implements TieredStorageInterface {
  state = async (location: Location): Promise<State> => {
    const type = getType(location);
    if (type == "account") {
      return await getAccountState(location as { account_id: string });
    } else if (type == "project") {
      return await getProjectState(location as { project_id: string });
    }
    throw Error("invalid type");
  };

  info = async (location: Location): Promise<Info> => {
    const type = getType(location);
    if (type == "account") {
      return await getAccountInfo(location as { account_id: string });
    } else if (type == "project") {
      return await getProjectInfo(location as { project_id: string });
    }
    throw Error("invalid type");
  };

  restore = async (location: Location): Promise<void> => {
    const type = getType(location);
    if (type == "account") {
      return await restoreAccount(location as { account_id: string });
    } else if (type == "project") {
      return await restoreProject(location as { project_id: string });
    }
    throw Error("invalid type");
  };

  archive = async (location: Location): Promise<void> => {
    const type = getType(location);
    if (type == "account") {
      return await archiveAccount(location as { account_id: string });
    } else if (type == "project") {
      return await archiveProject(location as { project_id: string });
    }
    throw Error("invalid type");
  };

  backup = async (location: Location): Promise<void> => {
    const type = getType(location);
    if (type == "account") {
      return await backupAccount(location as { account_id: string });
    } else if (type == "project") {
      return await backupProject(location as { project_id: string });
    }
    throw Error("invalid type");
  };

  // shut this server down (no-op right now)
  close = async (): Promise<void> => {};
}
