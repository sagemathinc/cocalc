/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Table } from "./types";

export type PublishedShareScope =
  | "public"
  | "unlisted"
  | "authenticated"
  | "org";

export interface PublishedShare {
  share_id: string;
  project_id: string;
  path: string;
  scope: PublishedShareScope;
  org_id?: string | null;
  share_region?: string | null;
  indexing_opt_in?: boolean;
  latest_manifest_id?: string | null;
  latest_manifest_hash?: string | null;
  published_at?: Date | null;
  size_bytes?: number | null;
  last_publish_status?: string | null;
  last_publish_error?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

Table({
  name: "published_shares",
  rules: {
    primary_key: "share_id",
    pg_indexes: ["project_id", "scope", "published_at", "indexing_opt_in"],
    pg_unique_indexes: ["(project_id,path)"],
  },
  fields: {
    share_id: {
      type: "uuid",
      desc: "Immutable share id used in published URLs.",
    },
    project_id: {
      type: "uuid",
      desc: "Project that owns the share.",
    },
    path: {
      type: "string",
      pg_type: "TEXT",
      desc: "Project-relative path that was published.",
    },
    scope: {
      type: "string",
      desc: "Share scope (public, unlisted, authenticated, org).",
    },
    org_id: {
      type: "uuid",
      desc: "Organization scope owner (only for org shares).",
    },
    share_region: {
      type: "string",
      desc: "R2 region used to store the published share data.",
    },
    indexing_opt_in: {
      type: "boolean",
      desc: "Whether the share is opt-in for search indexing.",
    },
    latest_manifest_id: {
      type: "string",
      desc: "Current published manifest id.",
    },
    latest_manifest_hash: {
      type: "string",
      desc: "Hash of the latest manifest.",
    },
    published_at: {
      type: "timestamp",
      desc: "Time of the latest successful publish.",
    },
    size_bytes: {
      type: "number",
      pg_type: "BIGINT",
      desc: "Size of the published snapshot in bytes.",
    },
    last_publish_status: {
      type: "string",
      desc: "Status of the most recent publish attempt.",
    },
    last_publish_error: {
      type: "string",
      desc: "Error message from the most recent publish attempt, if any.",
    },
    created_at: {
      type: "timestamp",
      desc: "When the share record was created.",
    },
    updated_at: {
      type: "timestamp",
      desc: "When the share record was last updated.",
    },
  },
});
