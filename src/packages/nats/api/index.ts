import type { Customize } from "@cocalc/util/db-schema/server-settings";

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
