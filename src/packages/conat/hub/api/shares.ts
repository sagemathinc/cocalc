import { authFirstRequireAccount } from "./util";

export type ShareScope = "public" | "unlisted" | "authenticated" | "org";

export type SharePublishStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "expired";

export interface PublishedShare {
  share_id: string;
  project_id: string;
  path: string;
  scope: ShareScope;
  org_id: string | null;
  share_region: string | null;
  indexing_opt_in: boolean;
  latest_manifest_id: string | null;
  latest_manifest_hash: string | null;
  published_at: Date | null;
  size_bytes: number | null;
  last_publish_status: SharePublishStatus | null;
  last_publish_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SharePublishResult {
  op_id: string;
  scope_type: "project";
  scope_id: string;
  service: string;
  stream_name: string;
}

export interface ShareViewerToken {
  token: string;
  expires_at: number;
}

export const shares = {
  createShare: authFirstRequireAccount,
  updateShare: authFirstRequireAccount,
  getShare: authFirstRequireAccount,
  listShares: authFirstRequireAccount,
  publishShare: authFirstRequireAccount,
  setIndexing: authFirstRequireAccount,
  viewerToken: authFirstRequireAccount,
};

export interface Shares {
  createShare: (opts: {
    account_id?: string;
    project_id: string;
    path: string;
    scope: ShareScope;
    indexing_opt_in?: boolean;
    org_id?: string | null;
  }) => Promise<PublishedShare>;

  updateShare: (opts: {
    account_id?: string;
    share_id: string;
    scope?: ShareScope;
    indexing_opt_in?: boolean;
    org_id?: string | null;
  }) => Promise<PublishedShare>;

  getShare: (opts: {
    account_id?: string;
    share_id: string;
  }) => Promise<PublishedShare | undefined>;

  listShares: (opts: {
    account_id?: string;
    project_id: string;
  }) => Promise<PublishedShare[]>;

  publishShare: (opts: {
    account_id?: string;
    share_id: string;
  }) => Promise<SharePublishResult>;

  setIndexing: (opts: {
    account_id?: string;
    share_id: string;
    indexing_opt_in: boolean;
  }) => Promise<PublishedShare>;

  viewerToken: (opts: {
    account_id?: string;
    share_id: string;
  }) => Promise<ShareViewerToken | null>;
}
