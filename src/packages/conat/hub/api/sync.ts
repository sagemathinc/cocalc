import { authFirst } from "./util";

export interface Sync {
  history: (opts: {
    account_id?: string;
    project_id: string;
    path: string;
  }) => Promise<any[]>;
}

export const sync = {
  history: authFirst,
};
