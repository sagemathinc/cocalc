import { noAuth, authFirst, requireAccount } from "./util";
import type { Customize } from "@cocalc/util/db-schema/server-settings";
import type {
  ApiKey,
  Action as ApiKeyAction,
} from "@cocalc/util/db-schema/api-keys";
import { type UserSearchResult } from "@cocalc/util/db-schema/accounts";

export const system = {
  getCustomize: noAuth,
  ping: noAuth,
  terminate: authFirst,
  userTracking: authFirst,
  manageApiKeys: authFirst,
  generateUserAuthToken: authFirst,
  revokeUserAuthToken: noAuth,
  userSearch: authFirst,
  getNames: requireAccount,
};

export interface System {
  // get all or specific customize data
  getCustomize: (fields?: string[]) => Promise<Customize>;
  // ping server and get back the current time
  ping: () => { now: number };
  // terminate a service:
  //   - only admin can do this.
  //   - useful for development
  terminate: (service: "database" | "api") => Promise<void>;

  userTracking: (opts: {
    event: string;
    value: object;
    account_id?: string;
  }) => Promise<void>;

  manageApiKeys: (opts: {
    account_id?: string;
    action: ApiKeyAction;
    project_id?: string;
    name?: string;
    expire?: Date;
    id?: number;
  }) => Promise<ApiKey[] | undefined>;

  generateUserAuthToken: (opts: {
    account_id?: string;
    user_account_id: string;
    password?: string;
  }) => Promise<string>;

  revokeUserAuthToken: (authToken: string) => Promise<void>;

  userSearch: (opts: {
    account_id?: string;
    query: string;
    limit?: number;
    admin?: boolean;
    only_email?: boolean;
  }) => Promise<UserSearchResult[]>;

  getNames: (account_ids: string[]) => Promise<{
    [account_id: string]:
      | {
          first_name: string;
          last_name: string;
          profile?: { color?: string; image?: string };
        }
      | undefined;
  }>;
}
