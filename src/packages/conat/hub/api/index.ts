import { isValidUUID } from "@cocalc/util/misc";
import { type Purchases, purchases } from "./purchases";
import { type System, system } from "./system";
import { type Projects, projects } from "./projects";
import { type DB, db } from "./db";
import { type Jupyter, jupyter } from "./jupyter";
import { handleErrorMessage } from "@cocalc/conat/util";

export interface HubApi {
  system: System;
  projects: Projects;
  db: DB;
  purchases: Purchases;
  jupyter: Jupyter;
}

const HubApiStructure = {
  system,
  projects,
  db,
  purchases,
  jupyter,
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
  return hubApi as HubApi;
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
