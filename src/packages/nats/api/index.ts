import type { Customize } from "@cocalc/util/db-schema/server-settings";
import { isValidUUID } from "@cocalc/util/misc";

export interface HubApi {
  getCustomize: (fields?: string[]) => Promise<Customize>;
  userQuery: (opts: {
    project_id?: string;
    query: any;
    options?: any[];
  }) => Promise<any>;
}

export function initHubApi(callHubApi): HubApi {
  const hubApi: any = {};
  for (const name of ["getCustomize", "userQuery"]) {
    hubApi[name] = async (...args) => await callHubApi({ name, args });
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
