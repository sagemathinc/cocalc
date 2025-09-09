import { authFirst } from "./util";

export interface Patch {
  seq: number;
  time: number;
  mesg: {
    time: number;
    wall: number;
    patch: string;
    user_id: number;
    is_snapshot?: boolean;
    parents: number[];
    version?: number;
  };
}

export interface Sync {
  history: (opts: {
    account_id?: string;
    project_id: string;
    path: string;
  }) => Promise<{ patches: Patch[] }>;
}

export const sync = {
  history: authFirst,
};
