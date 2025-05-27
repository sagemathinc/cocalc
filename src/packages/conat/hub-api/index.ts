import { isValidUUID } from "@cocalc/util/misc";
import { type Purchases, purchases } from "./purchases";
import { type System, system } from "./system";
import { type Projects, projects } from "./projects";
import { type DB, db } from "./db";
import { handleErrorMessage } from "@cocalc/conat/util";
import { removeUndefinedLeafs } from "@cocalc/util/misc";
import { cloneDeep } from "lodash";

export interface HubApi {
  system: System;
  projects: Projects;
  db: DB;
  purchases: Purchases;
}

const HubApiStructure = {
  system,
  projects,
  db,
  purchases,
} as const;

export function transformArgs({ name, args, account_id, project_id }) {
  const [group, functionName] = name.split(".");
  return HubApiStructure[group]?.[functionName]({
    args,
    account_id,
    project_id,
  });
}

export function initHubApi(callHubApi): HubApi {
  const hubApi: any = {};
  for (const group in HubApiStructure) {
    if (hubApi[group] == null) {
      hubApi[group] = {};
    }
    for (const functionName in HubApiStructure[group]) {
      hubApi[group][functionName] = async (...args) => {
        const resp = await callHubApi({
          name: `${group}.${functionName}`,
          args,
          timeout: args[0]?.timeout,
        });
        return handleErrorMessage(resp);
      };
    }
  }
  userQueryUndefined(hubApi);
  return hubApi as HubApi;
}

function userQueryUndefined(hubApi) {
  // due to MsgPack, we must strip undefined values to avoid random surprises, at least for
  // now.  It would be better to explicitly make get versus set queries use
  // a different api for each, instead of determining them by if there is a null.
  // Right now MsgPack turns undefined into null.
  // E.g., adding a new open file entry to the file log has "deleted:undefined" in the event,
  // which breaks things.
  const orig = hubApi.db.userQuery;
  hubApi.db.userQuery = async (opts) => {
    opts.query = cloneDeep(opts.query);
    removeUndefinedLeafs(opts.query);
    return await orig(opts);
  };
}

type UserId =
  | {
      account_id: string;
      project_id: undefined;
    }
  | {
      account_id: undefined;
      project_id: string;
    };
export function getUserId(subject: string): UserId {
  const segments = subject.split(".");
  const uuid = segments[2];
  if (!isValidUUID(uuid)) {
    throw Error(`invalid uuid '${uuid}'`);
  }
  const type = segments[1]; // 'project' or 'account'
  if (type == "project") {
    return { project_id: uuid } as UserId;
  } else if (type == "account") {
    return { account_id: uuid } as UserId;
  } else {
    throw Error("must be project or account");
  }
}
