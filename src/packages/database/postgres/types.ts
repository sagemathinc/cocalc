/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { EventEmitter } from "events";
import { Client } from "pg";

import { PassportStrategyDB } from "@cocalc/database/settings/auth-sso-types";
import { ProjectState, ProjectStatus } from "@cocalc/util/db-schema/projects";
import {
  CB,
  CBDB,
  QueryResult,
  QueryRows,
  UntypedQueryResult,
} from "@cocalc/util/types/database";

import type { SyncTable } from "../synctable/synctable";
import type { Changes } from "./changefeed";
import type { ProjectAndUserTracker } from "./project-and-user-tracker";

export type { QueryResult };

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
  values?: { [key: string]: any };
  order_by?: string;
  jsonb_set?: object;
  jsonb_merge?: object;
  cache?: boolean;
  retry_until_success?: any; // todo
  offset?: number;
  limit?: number;
  timeout_s?: number;
  conflict?: string;
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
  query?: object;
  options?: object[];
  changes?: undefined; // id of change feed
  cb?: CB<{ action?: "close" }>;
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

export interface PassportExistsOpts {
  strategy: string;
  id: string;
  cb?: CB;
}

export interface CreatePassportOpts {
  account_id: string;
  strategy: string; // our name of the strategy
  id: string;
  profile: any; // complex object
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
  profile: any;
  passport_profile: any;
}

export interface PostgreSQL extends EventEmitter {
  _dbg(desc: string): Function;
  _database: string;
  _host: string;
  _password: string;
  _user: string;

  _primary_key(table: string): string;
  _primary_keys(table: string): string[];

  _stop_listening(
    table: string,
    select: QuerySelect,
    watch: string[],
    cb?: CB,
  ): void;

  _query(opts: QueryOptions): void;

  _close_test_query?(): void;

  user_query(opts: UserQueryOptions): void;

  _client(): Client | undefined;
  _clients: Client[] | undefined;

  is_standby: boolean;

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
  get_collaborator_ids(opts: { account_id: string; cb: CB<string[]> }): void;
  get_collaborators(opts: { project_id: string; cb: CB<string[]> }): void;

  get_account(opts: {
    account_id?: string;
    email_address?: string;
    columns?: string[];
    cb: CBDB;
  }): void;

  add_user_to_project(opts: {
    account_id: string;
    project_id: string;
    group?: string;
    cb: CB;
  }): void;

  remove_user_from_project(opts: {
    account_id: string;
    project_id: string;
    cb: CB;
  }): void;

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

  do_account_creation_actions(opts: {
    email_address: string;
    account_id: string;
    cb: CB;
  }): void;

  mark_account_deleted(opts: {
    email_address: string;
    account_id: string;
    cb: CB;
  }): void;

  count_accounts_created_by(opts: {
    ip_address: string;
    age_s: number;
    cb: CB;
  }): void;

  account_exists(opts: { email_address: string; cb: CB }): void;

  is_banned_user(opts: {
    email_address?: string;
    account_id?: string;
    cb: CB;
  }): void;

  get_server_setting(opts: { name: string; cb: CB }): void;
  get_server_settings_cached(opts: { cb: CB }): void;
  set_server_setting(opts: { name: string; value: string; cb: CB }): void;
  server_settings_synctable(): any; // returns a table

  create_sso_account(opts: {
    first_name?: string; // invalid name will throw Error
    last_name?: string; // invalid name will throw Error
    created_by?: string;
    email_address?: string;
    password_hash?: string;
    passport_strategy: any;
    passport_id: string;
    passport_profile: any;
    usage_intent?: string;
    cb: CB;
  }): void;

  make_user_admin(opts: {
    account_id?: string;
    email_address?: string;
    cb: CB;
  });

  log(opts: { event: string; value: any; cb?: Function }): void;

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

  create_passport(opts: CreatePassportOpts): Promise<string>;

  delete_passport(opts: DeletePassportOpts): Promise<void>;

  set_passport_settings(
    db: PostgreSQL,
    opts: PassportStrategyDB & { cb?: CB },
  ): Promise<void>;

  get_passport_settings(opts: {
    strategy: string;
    cb?: CB;
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
    cb: CB;
  }): void;
  verify_email_check_token(opts: { email_address: string; token: string });
  reset_server_settings_cache(): void;

  update_coupon_history(opts: {
    account_id: string;
    coupon_history;
    cb: CB;
  }): void;

  get_coupon_history(opts: { account_id: string; cb: CB }): void;

  get_user_project_upgrades(opts: { account_id: string; cb: CB }): void;

  remove_all_user_project_upgrades(opts: {
    account_id: string;
    projects: string[];
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

  is_connected(): boolean;

  verify_email_create_token(opts: {
    account_id: string;
    cb: CB<{
      token: string;
      email_address: string;
    }>;
  }): Promise<void>;

  user_query_cancel_changefeed(opts: { id: any; cb?: CB }): void;

  save_blob(opts: SaveBlobOpts): void;

  set_project_state(opts: {
    project_id: string;
    state: ProjectState;
    time?: Date;
    error?: any;
    ip?: string;
    cb: CB;
  }): void;

  set_project_status(opts: { project_id: string; status: ProjectStatus }): void;

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

  webapp_error(opts: object);

  set_project_settings(opts: { project_id: string; settings: object; cb?: CB });

  // Database operations (postgres-ops)
  backup_tables(opts: {
    tables: string[] | "all" | "critical" | string;
    path?: string;
    limit?: number;
    bup?: boolean;
    cb: CB;
  }): void;
  _backup_table(opts: { table: string; path?: string; cb: CB }): void;
  _backup_bup(opts: { path?: string; cb: CB }): void;
  _get_backup_tables(tables: string[] | "all" | "critical" | string): string[];
  restore_tables(opts: {
    tables?: string[] | "all" | "critical" | string;
    path?: string;
    limit?: number;
    cb: CB;
  }): void;
  _restore_table(opts: { table: string; path?: string; cb: CB }): void;

  uncaught_exception: (err: any) => void;
}

// This is an extension of BaseProject in projects/control/base.ts
// We define the methods we actually use to avoid circular dependencies
type Project = EventEmitter & {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  setAllQuotas?: () => Promise<void>;
};

export type PostgreSQLConstructor = new (...args: any[]) => PostgreSQL;
