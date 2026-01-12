import { isValidUUID } from "@cocalc/util/misc";
import { type Purchases, purchases } from "./purchases";
import { type System, system } from "./system";
import { type Projects, projects } from "./projects";
import { type DB, db } from "./db";
import { type Jupyter, jupyter } from "./jupyter";
import { handleErrorMessage } from "@cocalc/conat/util";
import { type Sync, sync } from "./sync";
import { type Org, org } from "./org";
import { type Messages, messages } from "./messages";
import { type Compute, compute } from "./compute";
import { type FileSync, fileSync } from "./file-sync";
import { type Hosts, hosts } from "./hosts";
import { type Software, software } from "./software";

export interface HubApi {
  system: System;
  projects: Projects;
  db: DB;
  purchases: Purchases;
  jupyter: Jupyter;
  sync: Sync;
  org: Org;
  messages: Messages;
  compute: Compute;
  fileSync: FileSync;
  hosts: Hosts;
  software: Software;
}

const HubApiStructure = {
  system,
  projects,
  db,
  purchases,
  jupyter,
  sync,
  org,
  messages,
  compute,
  fileSync,
  hosts,
  software,
} as const;

export function transformArgs({
  name,
  args,
  account_id,
  project_id,
  host_id,
}: {
  name: string;
  args: any[];
  account_id?: string;
  project_id?: string;
  host_id?: string;
}) {
  const [group, functionName] = name.split(".");
  return HubApiStructure[group]?.[functionName]({
    args,
    account_id,
    project_id,
    host_id,
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
      host_id: undefined;
    }
  | {
      account_id: undefined;
      project_id: string;
      host_id: undefined;
    }
  | {
      account_id: undefined;
      project_id: undefined;
      host_id: string;
    };

export function getUserId(subject: string): UserId {
  const segments = subject.split(".");
  const uuid = segments[2];
  if (!isValidUUID(uuid)) {
    throw Error(`invalid uuid '${uuid}'`);
  }
  const type = segments[1]; // 'project' or 'account' or 'host'
  if (type == "project") {
    return { project_id: uuid } as UserId;
  } else if (type == "account") {
    return { account_id: uuid } as UserId;
  } else if (type == "host") {
    return { host_id: uuid } as UserId;
  } else {
    throw Error("must be project or account or host");
  }
}
