/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import type { Pool, PoolClient } from "pg";

import { PassportStrategyDB } from "@cocalc/database/settings/auth-sso-types";
import { ProjectStatus } from "@cocalc/util/db-schema/projects";
import {
  CB,
  CBDB,
  QueryResult,
  QueryRows,
  UntypedQueryResult,
} from "@cocalc/util/types/database";

import type { SyncTable } from "../synctable/synctable";
import type { Changes } from "./changefeed/changefeed";
import type { ProjectAndUserTracker } from "./project/project-and-user-tracker";
import type {
  RecentProjectsOptions,
  RecentProjectsResult,
} from "./project/recent";
import type { UserQueryQueue } from "../user-query/queue";

export type { QueryResult };
export type PostgreSQL = import("../postgres").PostgreSQL & PostgreSQLMethods;

export type QuerySelect = object;

export type QueryWhere =
  | { [field: string]: any }
  | { [field: string]: any }[]
  | string
  | string[];

export type ChangefeedSelect = Record<string, string>;
export type ChangefeedWhere =
  | QueryWhere
  | ((row: Record<string, unknown>) => boolean);

export type SyncTableKey = string;
export type SyncTableRow = Record<string, unknown>;
export type SyncTableWhereFunction = (key: SyncTableKey) => boolean;
export type SyncTableNotificationAction = "DELETE" | "INSERT" | "UPDATE";
export type SyncTableNotification = [
  action: SyncTableNotificationAction | string,
  new_val?: SyncTableRow | null,
  old_val?: SyncTableRow | null,
];

export interface PublicPathListingEntry extends Record<string, unknown> {
  name?: string;
}

export interface PublicPathListing extends Record<string, unknown> {
  files?: PublicPathListingEntry[];
}

export type BlobCompression = "gzip" | "zlib";

export interface SyncstringPatch {
  string_id: string;
  time: Date;
  patch: string;
  is_snapshot: boolean;
  user_id?: number;
  snapshot?: string;
  sent?: Date;
  prev?: Date;
  wall?: Date;
  seq_info?: Record<string, unknown>;
  format?: number | null;
  parents?: number[];
  version?: number;
}

export interface SyncstringPatchInput extends Omit<
  SyncstringPatch,
  "is_snapshot"
> {
  is_snapshot?: boolean;
}

export interface VerifyEmailCreateTokenResult {
  email_address: string;
  token: string;
  old_challenge?: any;
}

export interface PostgreSQLOptions {
  debug?: boolean;
  cache_expiry?: number;
  cache_size?: number;
  concurrent_warn?: number;
  concurrent_heavily_loaded?: number;
  ensure_exists?: boolean;
  timeout_ms?: number;
  timeout_delay_ms?: number;
}

export type ProjectActionRequest = Record<string, any> & {
  action: string;
  time?: any;
  started?: Date;
  finished?: Date;
  err?: any;
};

export type ProjectActionOptions = {
  project_id: string;
  action_request: ProjectActionRequest;
  cb: CB;
};

export interface LegacySyncstringPatch {
  id: [string, string];
  user: number;
  patch: string;
  snapshot?: string;
  sent?: Date;
  prev?: Date;
}

export type ImportPatch = SyncstringPatchInput | LegacySyncstringPatch;

export interface SaveBlobOpts {
  uuid?: string;
  blob: Buffer | string;
  ttl?: number;
  project_id?: string;
  account_id?: string;
  check?: boolean;
  compress?: BlobCompression;
  level?: number;
  cb: CB<number | undefined>;
}

export interface GetBlobOpts {
  uuid: string;
  save_in_db?: boolean;
  touch?: boolean;
  cb: CB<Buffer | undefined>;
}

export interface TouchBlobOpts {
  uuid: string;
  cb?: CB;
}

export interface CopyBlobToGcloudOpts {
  uuid: string;
  bucket?: string;
  force?: boolean;
  remove?: boolean;
  cb?: CB;
}

export interface BackupBlobsToTarballOpts {
  limit?: number;
  path: string;
  throttle?: number;
  repeat_until_done?: number;
  map_limit?: number;
  cb?: CB<string>;
}

export type BlobCopyError = string | Error;
export type BlobCopyErrors = Record<string, BlobCopyError>;

export interface CopyAllBlobsToGcloudOpts {
  bucket?: string;
  limit?: number;
  map_limit?: number;
  throttle?: number;
  repeat_until_done_s?: number;
  errors?: BlobCopyErrors;
  remove?: boolean;
  cutoff?: string;
  cb: CB<void, BlobCopyError | BlobCopyErrors>;
}

export interface BlobMaintenanceOpts {
  path?: string;
  map_limit?: number;
  blobs_per_tarball?: number;
  throttle?: number;
  syncstring_delay?: number; // delay between syncstring operations (default: 1000ms)
  backup_repeat?: number; // repeat count for backup_blobs_to_tarball (default: 5)
  copy_repeat_s?: number; // repeat duration in seconds for copy_all_blobs_to_gcloud (default: 5)
  cb?: CB;
}

export interface CloseBlobOpts {
  uuid: string;
  bucket?: string;
  cb?: CB;
}

export interface RemoveBlobTtlsOpts {
  uuids: string[];
  cb: CB;
}

export interface SyncstringMaintenanceOpts {
  age_days?: number;
  map_limit?: number;
  limit?: number;
  repeat_until_done?: boolean;
  delay?: number;
  cb?: CB;
}

export interface ExportPatchesOpts {
  string_id: string;
  cb?: CB<SyncstringPatch[]>;
}

export interface ImportPatchesOpts {
  patches: ImportPatch[];
  string_id?: string;
  cb?: CB;
}

export interface DeleteSyncstringOpts {
  string_id: string;
  cb?: CB;
}

export interface InsertRandomComputeImagesOpts {
  cb?: CB;
}

export interface DeleteBlobOpts {
  uuid: string;
  cb?: CB;
}

export interface ArchivePatchesOpts {
  string_id: string;
  compress?: BlobCompression;
  level?: number;
  cutoff?: Date;
  cb?: CB;
}

// There are many more options still -- add them as needed.
export interface QueryOptions<T = UntypedQueryResult> {
  select?: string | string[];
  table?: string;
  where?: QueryWhere;
  query?: string;
  set?: { [key: string]: any };
  params?: any[];
  values?: { [key: string]: any } | Array<{ [key: string]: any }>;
  order_by?: string;
  jsonb_set?: object;
  jsonb_merge?: object;
  cache?: boolean;
  retry_until_success?: any; // todo
  offset?: number;
  limit?: number;
  timeout_s?: number;
  pg_params?: { [key: string]: string | number }; // PostgreSQL parameters for SET LOCAL
  conflict?: string | string[];
  safety_check?: boolean; // Default: true - prevents UPDATE/DELETE without WHERE
  cb?: CB<QueryRows<T>>;
}

export interface AsyncQueryOptions<T = UntypedQueryResult> extends Omit<
  QueryOptions<T>,
  "cb"
> {}

export interface UserQueryOptions {
  client_id?: string; // if given, uses to control number of queries at once by one client.
  priority?: number; // (NOT IMPLEMENTED) priority for this query (an integer [-10,...,19] like in UNIX)
  account_id?: string;
  project_id?: string;
  query?: unknown;
  options?: Record<string, unknown>[];
  changes?: string; // id of change feed
  cb?: CB<any>;
}

export interface ChangefeedOptions {
  table: string; // Name of the table
  select: ChangefeedSelect; // Map from field names to postgres data types. These must
  // determine entries of table (e.g., primary key).
  where: ChangefeedWhere; // Condition involving only the fields in select; or function taking
  // obj with select and returning true or false
  watch: string[]; // Array of field names we watch for changes
  cb: CB<Changes>;
}

export interface SyncTableOptions {
  table: string;
  columns?: string[];
  where?: QueryWhere;
  limit?: number;
  order_by?: string;
  where_function?: SyncTableWhereFunction;
  idle_timeout_s?: number;
  cb?: CB<SyncTable>;
}

export interface ProjectAndUserTrackerOptions {
  cb: CB<ProjectAndUserTracker>;
}

export interface DeletePassportOpts {
  account_id: string;
  strategy: string; // our name of the strategy
  id: string;
}

export type PassportProfile = Record<string, unknown>;

export interface PassportExistsOpts {
  strategy: string;
  id: string;
  cb?: CB;
}

export interface CreatePassportOpts {
  account_id: string;
  strategy: string; // our name of the strategy
  id: string;
  profile?: PassportProfile; // complex object
  email_address?: string;
  first_name?: string;
  last_name?: string;
  cb?: CB;
}

export interface UpdateAccountInfoAndPassportOpts {
  account_id: string;
  first_name?: string;
  last_name?: string;
  strategy: string; // our name of the strategy
  id: string;
  profile: PassportProfile;
  passport_profile: PassportProfile;
}

export interface CreateSsoAccountOpts {
  first_name?: string;
  last_name?: string;
  created_by?: string;
  email_address?: string;
  password_hash?: string;
  lti_id?: string[];
  passport_strategy?: string;
  passport_id?: string;
  passport_profile?: PassportProfile;
  usage_intent?: string;
}

export interface PostgreSQLMethods extends EventEmitter {
  _dbg(desc: string): (...args: unknown[]) => void;
  _pool: Pool;
  _listen_client?: PoolClient;
  _query_client?: PoolClient;
  _connected?: boolean;
  _ensure_exists?: boolean;
  _concurrent_queries?: number;
  _timeout_ms?: number; // Connection timeout for health check queries
  _timeout_delay_ms?: number; // Delay before timeout enforcement after connect
  _test_query?: NodeJS.Timeout; // Interval timer for periodic health check queries
  _stats_cached?: any; // Internal cache for statistics
  _listening?: Record<string, number>;
  _project_and_user_tracker?: ProjectAndUserTracker;
  _project_and_user_tracker_cbs?: Array<CB<ProjectAndUserTracker>>;

  _primary_key(table: string): string;
  _primary_keys(table: string): string[];

  _stop_listening(
    table: string,
    select: QuerySelect,
    watch: string[],
    cb?: CB,
  ): void;

  _query(opts: QueryOptions): void;
  _query_retry_until_success(opts: QueryOptions): void;

  // Group 4: Test Query & Health Monitoring
  _do_test_query(): void;
  _init_test_query(): void;
  _close_test_query(): void;

  // Group 6: Query Engine
  _validate_opts(opts: any): boolean; // Returns false and calls cb if validation fails
  _count(opts: { table: string; where?: QueryWhere; cb: CB<number> }): void;
  __do_query(opts: QueryOptions): void; // Internal query execution

  user_query(opts: UserQueryOptions): void;
  project_action(opts: ProjectActionOptions): void;
  _user_query_queue?: UserQueryQueue;
  _user_get_changefeed_counts?: Record<string, number>;
  _user_get_changefeed_id_to_user?: Record<string, string>;
  _changefeeds?: Record<string, Changes>;

  _get_query_client(): Promise<PoolClient>;
  _get_listen_client(): Promise<PoolClient>;
  get_db_query(): Pool["query"] | undefined;

  _create_account_passport_keys?: Record<string, Date>;

  get_site_settings(opts: { cb: CB }): void;

  async_query<T = UntypedQueryResult>(
    opts: AsyncQueryOptions,
  ): Promise<QueryRows<T>>;

  _listen(
    table: string,
    select: QuerySelect,
    watch: string[],
    cb?: CB<string>,
  ): void;

  changefeed(opts: ChangefeedOptions): Changes | undefined;

  account_ids_to_usernames(opts: { account_ids: string[]; cb: CB }): void;

  get_project(opts: {
    project_id: string;
    columns?: string[];
    cb: CB<Record<string, unknown> | undefined>;
  }): void;
  get_public_paths(opts: { project_id: string; cb: CB<string[]> }): void;
  has_public_path(opts: { project_id: string; cb: CB<boolean> }): void;
  path_is_public(opts: {
    project_id: string;
    path: string;
    cb: CB<boolean>;
  }): void;
  filter_public_paths(opts: {
    project_id: string;
    path: string;
    listing: PublicPathListing;
    cb: CB<PublicPathListing>;
  }): void;
  recently_modified_projects(opts: {
    max_age_s: number;
    cb: CB<string[]>;
  }): void;
  get_open_unused_projects(opts: {
    min_age_days?: number;
    max_age_days?: number;
    host: string;
    cb: CB<string[]>;
  }): void;

  set_project_storage_request(opts: {
    project_id: string;
    action: string;
    target?: string;
    cb: CB;
  }): void;
  get_project_storage_request(opts: { project_id: string; cb: CB }): void;

  set_project_state(opts: {
    project_id: string;
    state: string;
    time?: Date;
    error?: string;
    ip?: string;
    cb: CB;
  }): void;
  get_project_state(opts: { project_id: string; cb: CB }): void;

  set_project_host(opts: {
    project_id: string;
    host: string;
    cb: CB<Date>;
  }): void;
  unset_project_host(opts: { project_id: string; cb: CB }): void;
  get_project_host(opts: {
    project_id: string;
    cb: CB<string | undefined>;
  }): void;

  set_project_storage(opts: {
    project_id: string;
    host: string;
    cb: CB<Date>;
  }): void;
  get_project_storage(opts: { project_id: string; cb: CB<any> }): void;
  update_project_storage_save(opts: { project_id: string; cb: CB }): void;

  get_project_settings(opts: { project_id: string; cb: CB<any> }): void;
  set_project_settings(opts: {
    project_id: string;
    settings: any;
    cb: CB;
  }): void;

  get_project_extra_env(opts: { project_id: string; cb: CB<any> }): void;

  recent_projects(
    opts: RecentProjectsOptions & { cb: CB<RecentProjectsResult> },
  ): void;

  set_run_quota(
    project_id: string,
    run_quota: Record<string, unknown>,
  ): Promise<void>;

  get_collaborator_ids(opts: { account_id: string; cb: CB<string[]> }): void;
  get_collaborators(opts: { project_id: string; cb: CB<string[]> }): void;

  get_account(opts: {
    account_id?: string;
    email_address?: string;
    columns?: string[];
    cb: CBDB;
  }): void;

  _validate_opts(opts: any): boolean;

  sanitize(value: string): string;

  add_user_to_project(opts: {
    account_id: string;
    project_id: string;
    group?: string;
    cb: CB;
  }): void;

  remove_collaborator_from_project(opts: {
    account_id: string;
    project_id: string;
    cb: CB;
  }): void;

  remove_user_from_project(opts: {
    account_id: string;
    project_id: string;
    cb: CB;
  }): void;

  verify_email_create_token(opts: {
    account_id: string;
    cb?: CB<VerifyEmailCreateTokenResult>;
  }): Promise<VerifyEmailCreateTokenResult | undefined>;

  verify_email_check_token(opts: {
    email_address: string;
    token: string;
    cb?: CB;
  }): Promise<void>;

  verify_email_get(opts: {
    account_id: string;
    cb?: CB<any>;
  }): Promise<any | undefined>;

  is_verified_email(opts: {
    email_address: string;
    cb?: CB<boolean>;
  }): Promise<boolean | undefined>;

  account_creation_actions(opts: {
    email_address: string;
    action?: any;
    ttl?: number;
    cb: (err, actions?: any[]) => void;
  }): void;

  account_creation_actions_success(opts: { account_id: string; cb: CB }): void;

  do_account_creation_actions(opts: {
    email_address: string;
    account_id: string;
    cb: CB;
  }): void;

  _user_set_query_project_users(
    obj: any,
    account_id?: string,
  ): Record<string, unknown> | undefined;

  accountIsInOrganization(opts: {
    organization_id: string;
    account_id: string;
  }): Promise<boolean>;

  nameToAccountOrOrganization(name: string): Promise<string | undefined>;

  user_is_in_project_group(opts: {
    account_id?: string;
    project_id: string;
    groups?: string[];
    cache?: boolean;
    cb: CB<boolean>;
  }): void;

  user_is_collaborator(opts: {
    account_id: string;
    project_id: string;
    cache?: boolean;
    cb: CB<boolean>;
  });

  when_sent_project_invite(opts: {
    project_id: string;
    to: string;
    cb: (err, result?: Date | number) => void;
  }): void;

  sent_project_invite(opts: {
    project_id: string;
    to: string;
    error?: string;
    cb?: CB;
  }): void;

  get_user_column(
    column: string,
    account_id: string,
    cb: CB<unknown | undefined>,
  );

  _get_project_column(
    column: string,
    project_id: string,
    cb: CB<unknown | undefined>,
  );

  count_accounts_created_by(opts: {
    ip_address: string;
    age_s: number;
    cb: CB;
  }): void;

  account_exists(opts: { email_address: string; cb: CB }): void;

  delete_account(opts: { account_id: string; cb: CB }): void;

  mark_account_deleted(opts: {
    account_id?: string;
    email_address?: string;
    cb: CB;
  }): void;

  is_banned_user(opts: {
    email_address?: string;
    account_id?: string;
    cb: CB;
  }): void;

  get_server_setting(opts: { name: string; cb: CB }): void;
  get_server_settings_cached(opts: { cb: CB }): void;
  set_server_setting(opts: { name: string; value: string; cb: CB }): void;
  server_settings_synctable(opts?: Record<string, unknown>): any; // returns a table

  create_sso_account(opts: CreateSsoAccountOpts & { cb: CB<string> }): void;

  make_user_admin(opts: {
    account_id?: string;
    email_address?: string;
    cb: CB;
  });

  log(opts: { event: string; value: any; cb?: CB }): void;

  user_is_in_group(opts: { account_id: string; group: string; cb: CB }): void;

  sha1(...args): string;

  _throttle(name: string, time_s: number, ...key: any[]): boolean;
  _clear_throttles(): void;

  clear_cache(): void;

  get_project_ids_with_user(opts: {
    account_id: string;
    is_owner?: boolean;
    cb: CB<string[]>;
  }): void;
  get_account_ids_using_project(opts: {
    project_id: string;
    cb: CB<string[]>;
  }): void;

  get_remember_me(opts: { hash: string; cache?: boolean; cb: CB }): void;
  invalidate_all_remember_me(opts: {
    account_id?: string;
    email_address?: string;
    cb?: CB;
  }): void;
  delete_remember_me(opts: { hash: string; cb?: CB }): void;

  passport_exists(opts: PassportExistsOpts): Promise<string | undefined>;

  create_passport(opts: CreatePassportOpts): Promise<void>;

  set_passport_settings(opts: PassportStrategyDB & { cb?: CB }): Promise<void>;

  get_passport_settings(opts: {
    strategy: string;
    cb?: (data: object) => void;
  }): Promise<PassportStrategyDB>;
  get_all_passport_settings(): Promise<PassportStrategyDB[]>;
  get_all_passport_settings_cached(): Promise<PassportStrategyDB[]>;

  update_account_and_passport(
    opts: UpdateAccountInfoAndPassportOpts,
  ): Promise<void>;

  change_password(opts: {
    account_id: string;
    password_hash: string;
    invalidate_remember_me?: boolean;
    cb: CB;
  });
  reset_password(opts: {
    email_address?: string;
    account_id?: string;
    password?: string;
    random?: boolean;
    cb?: CB;
  }): void;
  set_password_reset(opts: {
    email_address: string;
    ttl: number;
    cb: CB<string>;
  }): void;
  get_password_reset(opts: { id: string; cb: CB<string | undefined> }): void;
  delete_password_reset(opts: { id: string; cb: CB }): void;
  record_password_reset_attempt(opts: {
    email_address: string;
    ip_address: string;
    ttl: number;
    cb: CB;
  }): void;
  count_password_reset_attempts(opts: {
    email_address?: string;
    ip_address?: string;
    age_s: number;
    cb: CB<number>;
  }): void;
  change_email_address(opts: {
    account_id: string;
    email_address: string;
    stripe: any;
    cb?: CB;
  }): void;
  reset_server_settings_cache(): void;

  update_coupon_history(opts: {
    account_id: string;
    coupon_history;
    cb: CB;
  }): void;

  get_coupon_history(opts: { account_id: string; cb: CB }): void;

  get_project_quotas(opts: { project_id: string; cb: CB }): void;

  get_user_project_upgrades(opts: { account_id: string; cb: CB }): void;

  ensure_user_project_upgrades_are_valid(opts: {
    account_id: string;
    fix?: boolean;
    cb: CB;
  }): void;

  ensure_all_user_project_upgrades_are_valid(opts: {
    limit?: number;
    cb: CB;
  }): void;

  get_project_upgrades(opts: { project_id: string; cb: CB }): void;

  remove_all_user_project_upgrades(opts: {
    account_id: string;
    projects?: string[];
    cb: CB;
  }): void;

  _concurrent_warn: number;

  concurrent(): number;

  register_hub(opts: {
    host: string;
    port: number;
    clients: number;
    ttl: number;
    cb: CB;
  }): void;

  get_hub_servers(opts: { cb: CB }): void;

  get_stats_interval(opts: { start: Date; end: Date; cb: CB }): void;

  get_active_student_stats(opts: { cb: CB }): void;

  is_admin(opts: { account_id: string; cb: CB }): void;

  user_is_in_group(opts: { account_id: string; group: string; cb: CB }): void;

  account_exists(opts: { email_address: string; cb: CB }): void;

  get_account(opts: {
    account_id?: string;
    email_address?: string;
    lti_id?: string[];
    columns?: string[];
    cb: CB;
  }): void;

  is_banned_user(opts: {
    account_id?: string;
    email_address?: string;
    cb: CB;
  }): void;

  _account_where(opts: {
    account_id?: string;
    email_address?: string;
    lti_id?: string[];
  }): {
    [key: string]: string | string[];
  };

  _touch_account(account_id: string, cb: CB): void;
  _touch_project(project_id: string, account_id: string, cb: CB): void;

  synctable(opts: SyncTableOptions): SyncTable | undefined;

  project_and_user_tracker(opts: ProjectAndUserTrackerOptions): Promise<void>;

  projects_that_need_to_be_started(): Promise<string[]>;

  // Group 5: Connection Management
  connect(opts: { max_time?: number; cb?: CB }): void;
  disconnect(): void;
  is_connected(): boolean;
  close(): void;

  user_query_cancel_changefeed(opts: { id: any; cb?: CB }): void;

  save_blob(opts: SaveBlobOpts): void;

  set_project_status(opts: {
    project_id: string;
    status: ProjectStatus;
    cb?: CB;
  }): void;

  touch_project(opts: { project_id: string; cb?: CB }): void;

  touch(opts: {
    project_id?: string;
    account_id: string;
    action?: string;
    path?: string;
    ttl_s?: number;
    cb?: CB;
  }): void;

  get_project_extra_env(opts: { project_id: string; cb: CB }): void;

  projectControl?: (project_id: string) => Project;

  ensure_connection_to_project?: (project_id: string, cb?: CB) => Promise<void>;

  get_blob(opts: GetBlobOpts): void;

  copy_blob_to_gcloud(opts: CopyBlobToGcloudOpts): void;

  backup_blobs_to_tarball(opts: BackupBlobsToTarballOpts): void;

  copy_all_blobs_to_gcloud(opts: CopyAllBlobsToGcloudOpts): void;

  blob_maintenance(opts: BlobMaintenanceOpts): Promise<void>;

  close_blob(opts: CloseBlobOpts): void;

  syncstring_maintenance(opts: SyncstringMaintenanceOpts): void;

  export_patches(opts: ExportPatchesOpts): Promise<SyncstringPatch[]>;

  import_patches(opts: ImportPatchesOpts);
  delete_syncstring(opts: DeleteSyncstringOpts);
  insert_random_compute_images(opts: InsertRandomComputeImagesOpts);
  delete_blob(opts: DeleteBlobOpts);
  touch_blob(opts: TouchBlobOpts): void;
  remove_blob_ttls(opts: RemoveBlobTtlsOpts): void;

  adminAlert?: (opts: {
    subject: string;
    body?: string;
  }) => Promise<number | undefined>;

  archivePatches(opts: ArchivePatchesOpts);

  when_sent_project_invite(opts: { project_id: string; to: string; cb?: CB });

  sent_project_invite(opts: {
    project_id: string;
    to: string;
    error?: string;
    cb?: CB;
  });

  account_creation_actions(opts: {
    email_address: string;
    action?: any;
    ttl?: number;
    cb: CB;
  });

  log_client_error(opts: {
    event: string;
    error: string;
    account_id?: string;
    cb?: CB;
  });

  webapp_error(opts: Record<string, unknown> & { cb?: CB }): void;

  set_project_settings(opts: { project_id: string; settings: object; cb?: CB });

  // Database operations (postgres-ops)
  _get_backup_tables(tables: string[] | "all" | "critical" | string): string[];

  uncaught_exception(err: any): Promise<void>;

  // Group 1: Database Utilities (postgres/core/util.ts)
  _debug?: boolean; // Debug mode flag
  _init_metrics(): void; // Initialize Prometheus metrics
  query_time_histogram?: any; // Prometheus histogram for query timing
  concurrent_counter?: any; // Prometheus counter for concurrent queries
  concurrent(): number; // Get current concurrent query count
  is_heavily_loaded(): boolean; // Check if database is heavily loaded
  sha1(...args: any[]): string; // Generate SHA1 hash from arguments
  sanitize(s: string): string; // Escape string for SQL injection prevention
  clear_cache(): void; // Clear LRU query cache
  engine(): string; // Return 'postgresql' identifier
  // Group 2: Schema & Metadata (postgres/schema/)
  _get_tables(cb: (err?: string | Error, tables?: string[]) => void): void; // Get list of all tables in public schema
  _get_columns(
    table: string,
    cb: (err?: string | Error, columns?: string[]) => void,
  ): void; // Get list of columns for a specific table
  _primary_keys(table: string): string[]; // Get array of primary key column names
  _primary_key(table: string): string; // Get single primary key (throws if composite)
  update_schema(opts: { cb?: (err?: any) => void }): void; // Sync database schema with SCHEMA definition

  _user_set_query_project_manage_users_owner_only(
    obj: any,
  ): boolean | undefined;
}

// This is an extension of BaseProject in projects/control/base.ts
// We define the methods we actually use to avoid circular dependencies
type Project = EventEmitter & {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  setAllQuotas?: () => Promise<void>;
};
