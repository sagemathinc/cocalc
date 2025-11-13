import { authFirst } from "./util";

export interface Jupyter {
  kernels: (opts: {
    account_id?: string;
    project_id?: string;
  }) => Promise<any[]>;

  execute: (opts: {
    input?: string;
    kernel?: string;
    history?: string[];
    hash?: string;
    tag?: string;
    project_id?: string;
    path?: string;
  }) => Promise<{ output: object[]; created: Date } | null>;
}

export const jupyter = {
  kernels: authFirst,
  execute: authFirst,
};
