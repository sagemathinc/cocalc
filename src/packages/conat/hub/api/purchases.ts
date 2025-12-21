import { authFirst } from "./util";
export type MembershipClass = "free" | "student" | "member" | "pro";

export interface MembershipEntitlements {
  project_defaults?: Record<string, unknown>;
  llm_limits?: Record<string, unknown>;
  features?: Record<string, unknown>;
}

export interface MembershipResolution {
  class: MembershipClass;
  source: "subscription" | "free";
  entitlements: MembershipEntitlements;
  subscription_id?: number;
  expires?: Date;
}

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
