import { authFirstRequireAccount } from "./util";

export type LroStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "expired";

export type LroScopeType = "project" | "account" | "host" | "hub";

export interface LroSummary {
  op_id: string;
  kind: string;
  scope_type: LroScopeType;
  scope_id: string;
  status: LroStatus;
  created_by: string | null;
  owner_type: "hub" | "host" | null;
  owner_id: string | null;
  routing: string | null;
  input: any;
  result: any;
  error: string | null;
  progress_summary: any;
  attempt: number;
  heartbeat_at: Date | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  updated_at: Date;
  expires_at: Date;
  dedupe_key: string | null;
  parent_id: string | null;
}

export type LroEvent =
  | {
      type: "progress";
      ts: number;
      phase?: string;
      message?: string;
      progress?: number;
      detail?: any;
      level?: "info" | "warn" | "error";
    }
  | {
      type: "summary";
      ts: number;
      summary: LroSummary;
    };

export const lro = {
  get: authFirstRequireAccount,
  list: authFirstRequireAccount,
  cancel: authFirstRequireAccount,
};

export interface LroApi {
  get: (opts: { account_id?: string; op_id: string }) => Promise<LroSummary | undefined>;
  list: (opts: {
    account_id?: string;
    scope_type: LroScopeType;
    scope_id: string;
    include_completed?: boolean;
  }) => Promise<LroSummary[]>;
  cancel: (opts: { account_id?: string; op_id: string }) => Promise<void>;
}
