import { authFirst } from "./util";
import type { MembershipResolution } from "@cocalc/server/membership/resolve";

export interface Purchases {
  getBalance: (opts?: { account_id?: string }) => Promise<number>;
  getMinBalance: (opts?: { account_id?: string }) => Promise<number>;
  getMembership: (opts?: { account_id?: string }) => Promise<MembershipResolution>;
}

export const purchases = {
  getBalance: authFirst,
  getMinBalance: authFirst,
  getMembership: authFirst,
};
