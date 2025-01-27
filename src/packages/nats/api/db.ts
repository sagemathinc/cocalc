import { authFirst } from "./util";

export const db = {
  userQuery: authFirst,
};

export interface DB {
  userQuery: (opts: {
    project_id?: string;
    account_id?: string;
    query: any;
    options?: any[];
  }) => Promise<any>;
}
