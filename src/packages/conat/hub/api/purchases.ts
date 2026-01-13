import { authFirst } from "./util";
import type { MoneyValue } from "@cocalc/util/money";
export type MembershipClass = string;

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

export interface LLMUsageWindowStatus {
  window: "5h" | "7d";
  used: number;
  limit?: number;
  remaining?: number;
  reset_at?: Date;
  reset_in?: string;
}

export interface LLMUsageStatus {
  units_per_dollar: number;
  windows: LLMUsageWindowStatus[];
}

export interface Purchases {
  getBalance: (opts?: { account_id?: string }) => Promise<MoneyValue>;
  getMinBalance: (opts?: { account_id?: string }) => Promise<MoneyValue>;
  getMembership: (opts?: { account_id?: string }) => Promise<MembershipResolution>;
  getLLMUsage: (opts?: { account_id?: string }) => Promise<LLMUsageStatus>;
}

export const purchases = {
  getBalance: authFirst,
  getMinBalance: authFirst,
  getMembership: authFirst,
  getLLMUsage: authFirst,
};
