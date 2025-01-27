import type { Customize } from "@cocalc/util/db-schema/server-settings";
import { isValidUUID } from "@cocalc/util/misc";

export interface HubApi {
  system: {
    getCustomize: (fields?: string[]) => Promise<Customize>;
  };

  db: {
    userQuery: (opts: {
      project_id?: string;
      account_id?: string;
      query: any;
      options?: any[];
    }) => Promise<any>;
  };

  purchases: {
    getBalance: ({ account_id }) => Promise<number>;
    getMinBalance: (account_id) => Promise<number>;
  };
}

const authFirst = ({ args, account_id, project_id }) => {
  if (args[0] == null) {
    args[0] = {} as any;
  }
  if (account_id) {
    args[0].account_id = account_id;
  } else if (project_id) {
    args[0].project_id = project_id;
  }
  return args;
};

const noAuth = ({ args }) => args;

const HubApiStructure = {
  system: {
    getCustomize: noAuth,
  },
  db: {
    userQuery: authFirst,
  },
  purchases: {
    getBalance: ({ account_id }) => {
      return [{ account_id }];
    },
    getMinBalance: ({ account_id }) => [account_id],
  },
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
      hubApi[group][functionName] = async (...args) =>
        await callHubApi({ name: `${group}.${functionName}`, args });
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
