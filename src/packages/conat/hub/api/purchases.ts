import { authFirst } from "./util";

export interface Purchases {
  getBalance: (opts?: { account_id?: string }) => Promise<number>;
  getMinBalance: (opts?: { account_id?: string }) => Promise<number>;
}

export const purchases = {
  getBalance: authFirst,
  getMinBalance: authFirst,
};
