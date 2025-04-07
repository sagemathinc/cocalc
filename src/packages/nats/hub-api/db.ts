import { authFirst } from "./util";

export const db = {
  userQuery: authFirst,
  touch: authFirst,
  getLegacyTimeTravelInfo: authFirst,
  getLegacyTimeTravelPatches: authFirst,
};

export interface DB {
  userQuery: (opts: {
    project_id?: string;
    account_id?: string;
    query: any;
    options?: any[];
  }) => Promise<any>;

  touch: (opts: {
    account_id?: string;
    project_id?: string;
    path?: string;
    action?: string;
  }) => Promise<void>;

  getLegacyTimeTravelInfo: (opts: {
    account_id?: string;
    project_id: string;
    path: string;
  }) => Promise<{ uuid: string; users?: string[] }>;

  // returns JSON.stringify({patches:[patch0,patch1,...]})
  getLegacyTimeTravelPatches: (opts: {
    account_id?: string;
    uuid: string;
  }) => Promise<string>;
}
