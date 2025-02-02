import { authFirst } from "./util";

export const db = {
  userQuery: authFirst,
  touch: authFirst,
};

export interface DB {
  userQuery: (opts: {
    project_id?: string;
    account_id?: string;
    query: any;
    options?: any[];
  }) => Promise<any>;

  touch: (opts: {
    account_id: string;
    project_id?: string;
    path?: string;
    action?: string;
  }) => Promise<void>;
}
