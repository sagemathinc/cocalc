/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { EventEmitter } from "events";
import LRU from "lru-cache";
import type { Pool, PoolClient } from "pg";

import getPool from "@cocalc/database/pool";
import { callback2 } from "@cocalc/util/async-utils";
import { bind_methods } from "@cocalc/util/misc";
import { SCHEMA } from "@cocalc/util/schema";
import type { CB } from "@cocalc/util/types/database";

import type { BlobStore } from "./filesystem-bucket";
import {
  delete_remember_me,
  get_remember_me_message,
  invalidate_all_remember_me,
  SignedInMessage,
} from "./postgres/account/remember-me";

import {
  change_password,
  count_password_reset_attempts,
  delete_password_reset,
  get_password_reset,
  record_password_reset_attempt,
  reset_password,
  set_password_reset,
} from "./postgres/account/password";

import {
  accountIdsToUsernames,
  getCouponHistory,
  updateCouponHistory,
} from "./postgres/account/coupon-and-username";

import {
  getProjectState,
  getProjectStorageRequest,
  setProjectState,
  setProjectStorageRequest,
} from "./postgres/project/state";

import {
  addUserToProject,
  removeCollaboratorFromProject,
  removeUserFromProject,
} from "./postgres/account/collaborators";
import { validateOpts } from "./postgres/account/utils";
import { getProjectExtraEnv } from "./postgres/project/extra-env";
import {
  getProjectHost,
  setProjectHost,
  unsetProjectHost,
} from "./postgres/project/host";
import { recentProjects } from "./postgres/project/recent";
import {
  getProjectSettings,
  setProjectSettings,
} from "./postgres/project/settings";
import {
  getProjectStorage,
  setProjectStorage,
  updateProjectStorageSave,
} from "./postgres/project/storage";

import {
  isVerifiedEmail,
  verifyEmailCheckToken,
  verifyEmailCreateToken,
  verifyEmailGet,
} from "./postgres/account/verify-email";

import { setProjectStatus } from "./postgres/project/status";

import {
  accountCreationActions,
  accountCreationActionsSuccess,
  doAccountCreationActions,
} from "./postgres/account/creation";

import { accountIsInOrganization } from "./postgres/account/account-is-in-organization";
import { createSsoAccount } from "./postgres/account/create-sso-account";
import { deleteAccount, markAccountDeleted } from "./postgres/account/deletion";
import { nameToAccountOrOrganization } from "./postgres/account/name-to-account-or-organization";
import {
  sentProjectInvite,
  whenSentProjectInvite,
} from "./postgres/project/invites";
import { setRunQuota } from "./postgres/project/set-run-quota";

import {
  ensureAllUserProjectUpgradesAreValid,
  ensureUserProjectUpgradesAreValid,
  getProjectQuotas,
  getProjectUpgrades,
  getUserProjectUpgrades,
  removeAllUserProjectUpgrades,
  RemoveAllUserProjectUpgradesOptions,
} from "./postgres/project/upgrades";

// TODO is set_account_info_if_possible used here?!
import { is_paying_customer } from "./postgres/account/queries";

import {
  number_of_projects_using_site_license,
  projects_using_site_license,
  site_license_usage_stats,
} from "./postgres/site-license/analytics";

import { site_license_manager_set } from "./postgres/site-license/manager";
import { site_license_public_info } from "./postgres/site-license/public";
import {
  manager_site_licenses,
  matching_site_licenses,
} from "./postgres/site-license/search";
import { update_site_license_usage_log } from "./postgres/site-license/usage-log";

import {
  _get_project_column,
  get_account_ids_using_project,
  get_collaborator_ids,
  get_collaborators,
  get_open_unused_projects,
  get_project,
  get_project_ids_with_user,
  get_user_column,
  project_datastore_del,
  project_datastore_get,
  project_datastore_set,
  recently_modified_projects,
  user_is_collaborator,
  user_is_in_project_group,
} from "./postgres/project/queries";

import {
  permanently_unlink_all_deleted_projects_of_user,
  unlink_old_deleted_projects,
} from "./postgres/project/delete-projects";

import {
  filter_public_paths,
  get_all_public_paths,
  get_public_paths,
  has_public_path,
  path_is_public,
  unlist_all_public_paths,
} from "./postgres/paths/public-paths";

import { get_personal_user } from "./postgres/account/personal";

import {
  create_passport,
  get_all_passport_settings,
  get_all_passport_settings_cached,
  get_passport_settings,
  passport_exists,
  set_passport_settings,
  update_account_and_passport,
} from "./postgres/account/passport";

import { projects_that_need_to_be_started } from "./postgres/project/always-running";
import { calc_stats } from "./postgres/stats/stats";

import { default as registrationTokens } from "./postgres/account/registration-tokens";
import { default as centralLog } from "./postgres/central-log";
import { updateUnreadMessageCount } from "./postgres/changefeed/messages";

import {
  get_client_error_log,
  get_log,
  get_user_log,
  log_client_error,
  uncaught_exception,
  webapp_error,
} from "./postgres/log-query";

import {
  get_server_setting,
  get_server_settings_cached,
  get_site_settings,
  reset_server_settings_cache,
  server_settings_synctable,
  set_server_setting,
} from "./postgres/settings/server-settings";

import {
  account_exists,
  is_admin,
  user_is_in_group,
} from "./postgres/account/basic";
import { changeEmailAddress } from "./postgres/account/change-email-address";
import {
  accountWhere,
  get_account,
  is_banned_user,
} from "./postgres/account/core";
import {
  count_accounts_created_by,
  make_user_admin,
  touchAccount,
} from "./postgres/account/management";
import { get_hub_servers, register_hub } from "./postgres/hub/management";
import { insert_random_compute_images } from "./postgres/misc/insert-random-compute-images";
import {
  get_file_access,
  get_file_use,
  log_file_access,
  record_file_use,
} from "./postgres/paths/file-access";
import {
  touch,
  touchProject,
  touchProjectInternal,
} from "./postgres/stats/activity";
import {
  get_active_student_stats,
  get_stats_interval,
} from "./postgres/stats/statistics";
import { delete_syncstring } from "./postgres/syncstring/delete";
import { connectDo } from "./postgres/core/connect-do";
import { count as countQuery } from "./postgres/core/query-count";
import {
  deleteAll,
  deleteEntireDatabase,
  deleteExpired,
} from "./postgres/core/delete";
import {
  doTestQuery,
  closeTestQuery,
  initTestQuery,
} from "./postgres/core/health";
import { query } from "./postgres/core/query";
import { doQuery } from "./postgres/core/query-do";
import { queryRetryUntilSuccess } from "./postgres/core/query-retry";
import { throttle, clearThrottles } from "./postgres/core/throttle";
import { getColumns, getTables } from "./postgres/schema/introspection";
import { syncSchema } from "./postgres/schema";
import { primaryKey, primaryKeys } from "./postgres/schema/table";
import { count_result } from "./postgres/utils/count-result";
import * as UtilTS from "./postgres/core/util";
import { recordDisconnected } from "./postgres/record-connect-error";
import {
  closeDatabase,
  connect as connectTS,
  disconnect as disconnectTS,
  isConnected as isConnectedTS,
} from "./postgres/core/connect";

import {
  _extend_blob_ttl,
  archivePatches,
  backup_blobs_to_tarball,
  blob_maintenance,
  blob_store,
  close_blob,
  copy_all_blobs_to_gcloud,
  copy_blob_to_gcloud,
  delete_blob,
  export_patches,
  get_blob,
  import_patches,
  remove_blob_ttls,
  save_blob,
  syncstring_maintenance,
  touch_blob,
  type ExtendBlobTtlOpts,
} from "./postgres/blobs/methods-impl";
import { getBackupTables, type BackupTables } from "./postgres/ops/utils";
import type {
  ArchivePatchesOpts,
  BackupBlobsToTarballOpts,
  BlobMaintenanceOpts,
  ChangefeedOptions,
  ChangefeedSelect,
  CloseBlobOpts,
  CopyAllBlobsToGcloudOpts,
  CopyBlobToGcloudOpts,
  DeleteBlobOpts,
  ExportPatchesOpts,
  GetBlobOpts,
  ImportPatchesOpts,
  PostgreSQLMethods,
  PostgreSQLOptions,
  ProjectAndUserTrackerOptions,
  RemoveBlobTtlsOpts,
  SaveBlobOpts,
  SyncTableOptions,
  SyncstringMaintenanceOpts,
  SyncstringPatch,
  TouchBlobOpts,
} from "./postgres/types";
import {
  _ensure_trigger_exists,
  _listen,
  _notification,
  _stop_listening,
  changefeed,
  project_and_user_tracker,
  synctable,
} from "./synctable/methods-impl";
import type { Changes } from "./postgres/changefeed/changefeed";
import type { Stats } from "./postgres/stats/stats";
import type { ProjectAndUserTracker } from "./postgres/project/project-and-user-tracker";
import type { SyncTable } from "./synctable/synctable";
import * as userQuery from "./user-query/methods-impl";

type EnsureTriggerContext = Parameters<typeof _ensure_trigger_exists>[0];
type ListenContext = Parameters<typeof _listen>[0];
type NotificationContext = Parameters<typeof _notification>[0];
type StopListeningContext = Parameters<typeof _stop_listening>[0];
type SynctableContext = Parameters<typeof synctable>[0];
type ChangefeedContext = Parameters<typeof changefeed>[0];
type ProjectAndUserTrackerContext = Parameters<
  typeof project_and_user_tracker
>[0];
type ProjectControl = EventEmitter & {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  setAllQuotas?: () => Promise<void>;
};
type ProjectControlFunction = (project_id: string) => ProjectControl;
type RecentProjectsOptions = Parameters<typeof recentProjects>[1];
type RecentProjectsResult = Awaited<ReturnType<typeof recentProjects>>;
type RecentProjectsOptionsWithCb = RecentProjectsOptions & {
  cb: CB<RecentProjectsResult>;
};
type UserQueryMethodArgs<T extends keyof typeof userQuery> = Parameters<
  (typeof userQuery)[T]
>;
type UserQueryMethodReturn<T extends keyof typeof userQuery> = ReturnType<
  (typeof userQuery)[T]
>;
type MethodArgs<T> = T extends (...args: any[]) => any ? Parameters<T> : never;
type PgMethodOpts<K extends keyof PostgreSQLMethods> = MethodArgs<
  PostgreSQLMethods[K]
>[0];
type DbFunctionOpts<F extends (db: any, ...args: any[]) => any> =
  Parameters<F>[1];
type FunctionOpts<F extends (...args: any[]) => any> = Parameters<F>[0];
type DbFunctionOptsWithCb<
  F extends (db: any, ...args: any[]) => any,
  R = void,
> = DbFunctionOpts<F> & {
  cb?: CB<R>;
};
type ConfirmDeleteOpts = {
  confirm?: string;
  cb?: CB;
};
type CountOpts = {
  table: string;
  cb: CB<number>;
};

// Constants

const DEBUG = true;

// If database connection is non-responsive but no error raised directly
// by db client, then we will know and fix, rather than just sitting there...
const DEFAULT_TIMEOUS_MS = 60000;

// Do not test for non-responsiveness until a while after initial connection
// established, since things tend to work initially, *but* may also be much
// slower, due to tons of clients simultaneously connecting to DB.
const DEFAULT_TIMEOUT_DELAY_MS = DEFAULT_TIMEOUS_MS * 4;

const cbErrorMessage = (err: unknown): string | Error | null | undefined => {
  if (err instanceof Error) {
    return err.message ?? err;
  }
  if (typeof err === "string" || err == null) {
    return err;
  }
  return String(err);
};

const cbErrorObject = (err: unknown): string | Error | null | undefined => {
  if (err instanceof Error) {
    return err;
  }
  if (typeof err === "string" || err == null) {
    return err;
  }
  return new Error(String(err));
};

const runWithCb = async (
  cb: CB | undefined,
  fn: () => Promise<unknown>,
): Promise<void> => {
  try {
    await fn();
    cb?.();
  } catch (err) {
    cb?.(cbErrorMessage(err));
  }
};

const runWithCbOpts = async <T extends { cb?: CB<any> }, R = void>(
  opts: T,
  fn: (rest: Omit<T, "cb">) => Promise<R>,
): Promise<void> => {
  const { cb, ...rest } = opts;
  return runWithCb(cb, () => fn(rest));
};

const runWithCbResultValue = async <T>(
  cb: CB<T> | undefined,
  fn: () => Promise<T>,
): Promise<T | undefined> => {
  try {
    const result = await fn();
    cb?.(undefined, result);
    return result;
  } catch (err) {
    cb?.(cbErrorMessage(err));
    return undefined;
  }
};

const runWithCbOrThrow = async (
  cb: CB | undefined,
  fn: () => Promise<unknown>,
): Promise<void> => {
  try {
    await fn();
    cb?.();
  } catch (err) {
    cb?.(cbErrorObject(err));
    if (cb == null) {
      throw err;
    }
  }
};
export class PostgreSQL extends EventEmitter implements PostgreSQLMethods {
  // Connection configuration
  _pool!: Pool;
  _listen_client?: PoolClient;
  _query_client?: PoolClient;
  _connected?: boolean;
  _ensure_exists?: boolean;

  // State management
  _state!: string;
  _debug?: boolean;
  _timeout_ms?: number;
  _timeout_delay_ms?: number;

  // Client management
  _connecting?: Array<CB | undefined>;
  _connect_time?: Date;

  // Query management
  _concurrent_queries?: number;
  _concurrent_warn!: number;
  _concurrent_heavily_loaded!: number;
  _query_cache?: LRU<string, unknown>;

  // Monitoring
  _test_query?: NodeJS.Timeout;
  _stats_cached?: Record<string, unknown>;
  query_time_histogram?: Record<string, number>;
  concurrent_counter?: Record<string, number>;

  // Notification
  _listening?: Record<string, number>;
  _project_and_user_tracker?: ProjectAndUserTracker;
  _project_and_user_tracker_cbs?: Array<CB<ProjectAndUserTracker>>;

  // Status
  // External integrations
  declare projectControl?: ProjectControlFunction;
  declare ensure_connection_to_project?: (
    project_id: string,
    cb?: CB,
  ) => Promise<void>;
  declare adminAlert?: (opts: {
    subject: string;
    body?: string;
  }) => Promise<number | undefined>;

  // emits a 'connect' event whenever we successfully connect to the database and 'disconnect' when connection to postgres fails
  constructor(opts: PostgreSQLOptions = {}) {
    super(); // Must call super() first before accessing 'this'
    bind_methods(this); // Bind all methods to this instance to preserve 'this' context in callbacks
    const {
      debug = DEBUG,
      cache_expiry = 5000,
      cache_size = 300,
      concurrent_warn = 500,
      concurrent_heavily_loaded = 70,
      ensure_exists = true,
      timeout_ms = DEFAULT_TIMEOUS_MS,
      timeout_delay_ms = DEFAULT_TIMEOUT_DELAY_MS,
    } = opts;

    this._debug = debug;
    const dbg = this._dbg("constructor"); // must be after setting @_debug above
    dbg({
      debug,
      cache_expiry,
      cache_size,
      concurrent_warn,
      concurrent_heavily_loaded,
      ensure_exists,
      timeout_ms,
      timeout_delay_ms,
    });

    this.setMaxListeners(0); // because of a potentially large number of changefeeds
    this._state = "init";
    this._connected = false;
    this._timeout_ms = timeout_ms;
    this._timeout_delay_ms = timeout_delay_ms;
    this._ensure_exists = ensure_exists;
    this._concurrent_warn = concurrent_warn;
    this._concurrent_heavily_loaded = concurrent_heavily_loaded;

    this._pool = getPool({ ensureExists: ensure_exists });
    this._init_test_query();
    this._init_metrics();

    if (cache_expiry && cache_size) {
      this._query_cache = new LRU({
        max: cache_size,
        ttl: cache_expiry,
      });
    }
    this.connect({}); // start trying to connect
  }

  clear_cache() {
    return UtilTS.clearCache(this as any);
  }

  _clear_listening_state() {
    this._listening = {};
  }

  // Group 5: Connection Management - delegating to TypeScript
  close() {
    return closeDatabase(this as any);
  }

  /*
    If @_timeout_ms is set, then we periodically do a simple test query,
    to ensure that the database connection is working and responding to queries.
    If the query below times out, then the connection will get recreated.
    */
  // Group 4: Test Query & Health Monitoring - delegating to TypeScript
  _do_test_query() {
    return doTestQuery(this as any);
  }

  _init_test_query() {
    return initTestQuery(this as any);
  }

  _close_test_query() {
    return closeTestQuery(this as any);
  }

  engine() {
    return UtilTS.engine();
  }

  connect(opts: PgMethodOpts<"connect">) {
    return connectTS(this as any, opts);
  }

  disconnect() {
    return disconnectTS(this as any);
  }

  is_connected() {
    return isConnectedTS(this as any);
  }

  async _connect(cb) {
    return connectDo(this as any, cb);
  }

  async _get_query_client(): Promise<PoolClient> {
    if (this._query_client) {
      return this._query_client;
    }
    return await this._pool.connect();
  }

  async _get_listen_client(): Promise<PoolClient> {
    if (this._listen_client) {
      return this._listen_client;
    }
    const client = await this._pool.connect();
    if (this._notification != null) {
      client.on("notification", this._notification as any);
    }
    const onError = (err) => {
      client.removeListener("error", onError);
      client.removeAllListeners();
      if (this._listen_client === client) {
        delete this._listen_client;
      }
      client.release(err);
      this.emit("disconnect");
      recordDisconnected();
      this.connect({});
    };
    client.on("error", onError);
    this._listen_client = client;
    return client;
  }

  // Return query function of a database connection.
  get_db_query() {
    return this._pool?.query.bind(this._pool);
  }

  _dbg(f: string): (...args: unknown[]) => void {
    return UtilTS.dbg(this as any, f) as (...args: unknown[]) => void;
  }

  _init_metrics() {
    return UtilTS.initMetrics(this as any);
  }

  async async_query(opts: PgMethodOpts<"async_query">) {
    return await callback2(this._query.bind(this), opts);
  }

  _query(opts: PgMethodOpts<"_query">) {
    return query(this as any, opts);
  }

  _query_retry_until_success(opts: PgMethodOpts<"_query_retry_until_success">) {
    return queryRetryUntilSuccess(this as any, opts);
  }

  __do_query(opts: PgMethodOpts<"__do_query">) {
    return doQuery(this as any, opts);
  }

  // Group 6: Query Engine - delegating to TypeScript implementations
  _count(opts: PgMethodOpts<"_count">) {
    return countQuery(this as any, opts);
  }

  _confirm_delete(opts: ConfirmDeleteOpts) {
    const { confirm = "no", cb } = opts ?? {};
    const dbg = this._dbg("confirm");
    if (confirm !== "yes") {
      const err = `Really delete all data? -- you must explicitly pass in confirm='yes' (but confirm:'${confirm}')`;
      dbg(err);
      cb?.(err);
      return false;
    } else {
      return true;
    }
  }

  set_random_password(_opts) {
    throw Error("NotImplementedError");
  }

  // This will fail if any other clients have db open.
  // This function is very important for automated testing.
  delete_entire_database(opts: DbFunctionOpts<typeof deleteEntireDatabase>) {
    return deleteEntireDatabase(this as any, opts);
  }

  // Deletes all the contents of the tables in the database.  It doesn't
  // delete anything about the schema itself: indexes or tables.
  delete_all(opts: DbFunctionOpts<typeof deleteAll>) {
    return deleteAll(this as any, opts);
  }

  // return list of tables in the database
  // Group 2: Schema & Metadata - delegating to TypeScript
  _get_tables(cb) {
    return getTables(this as any, cb);
  }

  _get_columns(table, cb) {
    return getColumns(this as any, table, cb);
  }

  _primary_keys(table) {
    return primaryKeys(table);
  }

  _primary_key(table) {
    return primaryKey(table);
  }

  // Group 3: Throttling & Delete Operations - delegating to TypeScript
  _throttle(name, time_s, ...key) {
    return throttle(this as any, name, time_s, ...Array.from(key));
  }

  _clear_throttles() {
    return clearThrottles(this as any);
  }

  // Ensure that the actual schema in the database matches the one defined in SCHEMA.
  // This creates the initial schema, adds new columns, and in a VERY LIMITED
  // range of cases, *might be* be able to change the data type of a column.
  async update_schema(opts: PgMethodOpts<"update_schema">) {
    try {
      await syncSchema(SCHEMA);
      return typeof opts.cb === "function" ? opts.cb() : undefined;
    } catch (err) {
      return typeof opts.cb === "function" ? opts.cb(err) : undefined;
    }
  }

  // Return the number of outstanding concurrent queries.
  concurrent() {
    return UtilTS.concurrent(this as any);
  }

  is_heavily_loaded() {
    return UtilTS.isHeavilyLoaded(this as any);
  }

  // Compute the sha1 hash (in hex) of the input arguments, which are
  // converted to strings (via json) if they are not strings, then concatenated.
  // This is used for computing compound primary keys in a way that is relatively
  // safe, and in situations where if there were a highly unlikely collision, it
  // wouldn't be the end of the world.  There is a similar client-only slower version
  // of this function (in schema.coffee), so don't change it willy nilly.
  sha1(...args) {
    return UtilTS.sha1Hash(...Array.from(args || []));
  }

  // Go through every table in the schema with a column called "expire", and
  // delete every entry where expire is <= right now.
  // Note: this ignores those rows, where expire is NULL, because comparisons with NULL are NULL
  delete_expired(opts: DbFunctionOpts<typeof deleteExpired>) {
    return deleteExpired(this as any, opts);
  }

  // count number of entries in a table
  count(opts: CountOpts) {
    const { table, cb } = opts ?? {};
    if (!table) {
      cb?.("table must be specified");
      return;
    }
    if (typeof cb !== "function") {
      throw new Error("count requires a callback");
    }
    return this._query({
      query: `SELECT COUNT(*) FROM ${table}`,
      cb: count_result(cb),
    });
  }

  // sanitize strings before inserting them into a query string
  sanitize(s) {
    return UtilTS.sanitize(s);
  }

  save_blob(opts: SaveBlobOpts) {
    return save_blob(this, opts);
  }

  _extend_blob_ttl(opts: ExtendBlobTtlOpts) {
    return _extend_blob_ttl(this, opts);
  }

  get_blob(opts: GetBlobOpts) {
    return get_blob(this, opts);
  }

  touch_blob(opts: TouchBlobOpts) {
    return touch_blob(this, opts);
  }

  blob_store(bucket?: string): BlobStore {
    return blob_store(this, bucket);
  }

  copy_blob_to_gcloud(opts: CopyBlobToGcloudOpts) {
    return copy_blob_to_gcloud(this, opts);
  }

  backup_blobs_to_tarball(opts: BackupBlobsToTarballOpts) {
    return backup_blobs_to_tarball(this, opts);
  }

  copy_all_blobs_to_gcloud(opts: CopyAllBlobsToGcloudOpts) {
    return copy_all_blobs_to_gcloud(this, opts);
  }

  async blob_maintenance(opts: BlobMaintenanceOpts): Promise<void> {
    return blob_maintenance(this, opts);
  }

  remove_blob_ttls(opts: RemoveBlobTtlsOpts) {
    return remove_blob_ttls(this, opts);
  }

  close_blob(opts: CloseBlobOpts) {
    return close_blob(this, opts);
  }

  syncstring_maintenance(opts: SyncstringMaintenanceOpts) {
    return syncstring_maintenance(this, opts);
  }

  async archivePatches(opts: ArchivePatchesOpts): Promise<void> {
    return archivePatches(this, opts);
  }

  async export_patches(opts: ExportPatchesOpts): Promise<SyncstringPatch[]> {
    return export_patches(this, opts);
  }

  async import_patches(opts: ImportPatchesOpts): Promise<void> {
    return import_patches(this, opts);
  }

  delete_blob(opts: DeleteBlobOpts) {
    return delete_blob(this, opts);
  }

  _ensure_trigger_exists(
    table: string,
    select: ChangefeedSelect,
    watch: string[],
    cb: CB,
  ) {
    return _ensure_trigger_exists(
      this as unknown as EnsureTriggerContext,
      table,
      select,
      watch,
      cb,
    );
  }

  _listen(
    table: string,
    select: ChangefeedSelect,
    watch: string[],
    cb?: CB<string>,
  ) {
    return _listen(this as unknown as ListenContext, table, select, watch, cb);
  }

  _notification(mesg: { channel: string; payload: string }) {
    return _notification(this as unknown as NotificationContext, mesg);
  }

  _stop_listening(
    table: string,
    select: Record<string, string>,
    watch: string[],
    cb?: CB,
  ) {
    return _stop_listening(
      this as unknown as StopListeningContext,
      table,
      select,
      watch,
      cb,
    );
  }

  synctable(opts: SyncTableOptions): SyncTable | undefined {
    return synctable(this as unknown as SynctableContext, opts);
  }

  changefeed(opts: ChangefeedOptions): Changes | undefined {
    return changefeed(this as unknown as ChangefeedContext, opts);
  }

  async project_and_user_tracker(
    opts: ProjectAndUserTrackerOptions,
  ): Promise<void> {
    return project_and_user_tracker(
      this as unknown as ProjectAndUserTrackerContext,
      opts,
    );
  }

  cancel_user_queries(
    ...args: UserQueryMethodArgs<"cancel_user_queries">
  ): UserQueryMethodReturn<"cancel_user_queries"> {
    return userQuery.cancel_user_queries.call(this, ...args);
  }

  user_query(
    ...args: UserQueryMethodArgs<"user_query">
  ): UserQueryMethodReturn<"user_query"> {
    return userQuery.user_query.call(this, ...args);
  }

  _user_query(
    ...args: UserQueryMethodArgs<"_user_query">
  ): UserQueryMethodReturn<"_user_query"> {
    return userQuery._user_query.call(this, ...args);
  }

  _inc_changefeed_count(
    ...args: UserQueryMethodArgs<"_inc_changefeed_count">
  ): UserQueryMethodReturn<"_inc_changefeed_count"> {
    return userQuery._inc_changefeed_count.call(this, ...args);
  }

  _dec_changefeed_count(
    ...args: UserQueryMethodArgs<"_dec_changefeed_count">
  ): UserQueryMethodReturn<"_dec_changefeed_count"> {
    return userQuery._dec_changefeed_count.call(this, ...args);
  }

  _user_query_array(
    ...args: UserQueryMethodArgs<"_user_query_array">
  ): UserQueryMethodReturn<"_user_query_array"> {
    return userQuery._user_query_array.call(this, ...args);
  }

  user_query_cancel_changefeed(
    ...args: UserQueryMethodArgs<"user_query_cancel_changefeed">
  ): UserQueryMethodReturn<"user_query_cancel_changefeed"> {
    return userQuery.user_query_cancel_changefeed.call(this, ...args);
  }

  _user_get_query_columns(
    ...args: UserQueryMethodArgs<"_user_get_query_columns">
  ): UserQueryMethodReturn<"_user_get_query_columns"> {
    return userQuery._user_get_query_columns.call(this, ...args);
  }

  _require_is_admin(
    ...args: UserQueryMethodArgs<"_require_is_admin">
  ): UserQueryMethodReturn<"_require_is_admin"> {
    return userQuery._require_is_admin.call(this, ...args);
  }

  _require_project_ids_in_groups(
    ...args: UserQueryMethodArgs<"_require_project_ids_in_groups">
  ): UserQueryMethodReturn<"_require_project_ids_in_groups"> {
    return userQuery._require_project_ids_in_groups.call(this, ...args);
  }

  _query_parse_options(
    ...args: UserQueryMethodArgs<"_query_parse_options">
  ): UserQueryMethodReturn<"_query_parse_options"> {
    return userQuery._query_parse_options.call(this, ...args);
  }

  _parse_set_query_opts(
    ...args: UserQueryMethodArgs<"_parse_set_query_opts">
  ): UserQueryMethodReturn<"_parse_set_query_opts"> {
    return userQuery._parse_set_query_opts.call(this, ...args);
  }

  _user_set_query_enforce_requirements(
    ...args: UserQueryMethodArgs<"_user_set_query_enforce_requirements">
  ): UserQueryMethodReturn<"_user_set_query_enforce_requirements"> {
    return userQuery._user_set_query_enforce_requirements.call(this, ...args);
  }

  _user_set_query_where(
    ...args: UserQueryMethodArgs<"_user_set_query_where">
  ): UserQueryMethodReturn<"_user_set_query_where"> {
    return userQuery._user_set_query_where.call(this, ...args);
  }

  _user_set_query_values(
    ...args: UserQueryMethodArgs<"_user_set_query_values">
  ): UserQueryMethodReturn<"_user_set_query_values"> {
    return userQuery._user_set_query_values.call(this, ...args);
  }

  _user_set_query_hooks_prepare(
    ...args: UserQueryMethodArgs<"_user_set_query_hooks_prepare">
  ): UserQueryMethodReturn<"_user_set_query_hooks_prepare"> {
    return userQuery._user_set_query_hooks_prepare.call(this, ...args);
  }

  _user_query_set_count(
    ...args: UserQueryMethodArgs<"_user_query_set_count">
  ): UserQueryMethodReturn<"_user_query_set_count"> {
    return userQuery._user_query_set_count.call(this, ...args);
  }

  _user_query_set_delete(
    ...args: UserQueryMethodArgs<"_user_query_set_delete">
  ): UserQueryMethodReturn<"_user_query_set_delete"> {
    return userQuery._user_query_set_delete.call(this, ...args);
  }

  _user_set_query_conflict(
    ...args: UserQueryMethodArgs<"_user_set_query_conflict">
  ): UserQueryMethodReturn<"_user_set_query_conflict"> {
    return userQuery._user_set_query_conflict.call(this, ...args);
  }

  _user_query_set_upsert(
    ...args: UserQueryMethodArgs<"_user_query_set_upsert">
  ): UserQueryMethodReturn<"_user_query_set_upsert"> {
    return userQuery._user_query_set_upsert.call(this, ...args);
  }

  _user_query_set_upsert_and_jsonb_merge(
    ...args: UserQueryMethodArgs<"_user_query_set_upsert_and_jsonb_merge">
  ): UserQueryMethodReturn<"_user_query_set_upsert_and_jsonb_merge"> {
    return userQuery._user_query_set_upsert_and_jsonb_merge.call(this, ...args);
  }

  _user_set_query_main_query(
    ...args: UserQueryMethodArgs<"_user_set_query_main_query">
  ): UserQueryMethodReturn<"_user_set_query_main_query"> {
    return userQuery._user_set_query_main_query.call(this, ...args);
  }

  user_set_query(
    ...args: UserQueryMethodArgs<"user_set_query">
  ): UserQueryMethodReturn<"user_set_query"> {
    return userQuery.user_set_query.call(this, ...args);
  }

  _mod_fields(
    ...args: UserQueryMethodArgs<"_mod_fields">
  ): UserQueryMethodReturn<"_mod_fields"> {
    return userQuery._mod_fields.call(this, ...args);
  }

  _user_get_query_json_timestamps(
    ...args: UserQueryMethodArgs<"_user_get_query_json_timestamps">
  ): UserQueryMethodReturn<"_user_get_query_json_timestamps"> {
    return userQuery._user_get_query_json_timestamps.call(this, ...args);
  }

  _user_get_query_set_defaults(
    ...args: UserQueryMethodArgs<"_user_get_query_set_defaults">
  ): UserQueryMethodReturn<"_user_get_query_set_defaults"> {
    return userQuery._user_get_query_set_defaults.call(this, ...args);
  }

  _user_set_query_project_users(
    ...args: UserQueryMethodArgs<"_user_set_query_project_users">
  ): UserQueryMethodReturn<"_user_set_query_project_users"> {
    return userQuery._user_set_query_project_users.call(this, ...args);
  }

  _user_set_query_project_manage_users_owner_only(
    ...args: UserQueryMethodArgs<"_user_set_query_project_manage_users_owner_only">
  ): UserQueryMethodReturn<"_user_set_query_project_manage_users_owner_only"> {
    return userQuery._user_set_query_project_manage_users_owner_only.call(
      this,
      ...args,
    );
  }

  project_action(
    ...args: UserQueryMethodArgs<"project_action">
  ): UserQueryMethodReturn<"project_action"> {
    return userQuery.project_action.call(this, ...args);
  }

  _user_set_query_project_change_before(
    ...args: UserQueryMethodArgs<"_user_set_query_project_change_before">
  ): UserQueryMethodReturn<"_user_set_query_project_change_before"> {
    return userQuery._user_set_query_project_change_before.call(this, ...args);
  }

  _user_set_query_project_change_after(
    ...args: UserQueryMethodArgs<"_user_set_query_project_change_after">
  ): UserQueryMethodReturn<"_user_set_query_project_change_after"> {
    return userQuery._user_set_query_project_change_after.call(this, ...args);
  }

  _user_get_query_functional_subs(
    ...args: UserQueryMethodArgs<"_user_get_query_functional_subs">
  ): UserQueryMethodReturn<"_user_get_query_functional_subs"> {
    return userQuery._user_get_query_functional_subs.call(this, ...args);
  }

  _parse_get_query_opts(
    ...args: UserQueryMethodArgs<"_parse_get_query_opts">
  ): UserQueryMethodReturn<"_parse_get_query_opts"> {
    return userQuery._parse_get_query_opts.call(this, ...args);
  }

  _json_fields(
    ...args: UserQueryMethodArgs<"_json_fields">
  ): UserQueryMethodReturn<"_json_fields"> {
    return userQuery._json_fields.call(this, ...args);
  }

  _user_get_query_where(
    ...args: UserQueryMethodArgs<"_user_get_query_where">
  ): UserQueryMethodReturn<"_user_get_query_where"> {
    return userQuery._user_get_query_where.call(this, ...args);
  }

  _user_get_query_options(
    ...args: UserQueryMethodArgs<"_user_get_query_options">
  ): UserQueryMethodReturn<"_user_get_query_options"> {
    return userQuery._user_get_query_options.call(this, ...args);
  }

  _user_get_query_do_query(
    ...args: UserQueryMethodArgs<"_user_get_query_do_query">
  ): UserQueryMethodReturn<"_user_get_query_do_query"> {
    return userQuery._user_get_query_do_query.call(this, ...args);
  }

  _user_get_query_query(
    ...args: UserQueryMethodArgs<"_user_get_query_query">
  ): UserQueryMethodReturn<"_user_get_query_query"> {
    return userQuery._user_get_query_query.call(this, ...args);
  }

  _user_get_query_satisfied_by_obj(
    ...args: UserQueryMethodArgs<"_user_get_query_satisfied_by_obj">
  ): UserQueryMethodReturn<"_user_get_query_satisfied_by_obj"> {
    return userQuery._user_get_query_satisfied_by_obj.call(this, ...args);
  }

  _user_get_query_handle_field_deletes(
    ...args: UserQueryMethodArgs<"_user_get_query_handle_field_deletes">
  ): UserQueryMethodReturn<"_user_get_query_handle_field_deletes"> {
    return userQuery._user_get_query_handle_field_deletes.call(this, ...args);
  }

  _user_get_query_changefeed(
    ...args: UserQueryMethodArgs<"_user_get_query_changefeed">
  ): UserQueryMethodReturn<"_user_get_query_changefeed"> {
    return userQuery._user_get_query_changefeed.call(this, ...args);
  }

  user_get_query(
    ...args: UserQueryMethodArgs<"user_get_query">
  ): UserQueryMethodReturn<"user_get_query"> {
    return userQuery.user_get_query.call(this, ...args);
  }

  _user_set_query_syncstring_change_after(
    ...args: UserQueryMethodArgs<"_user_set_query_syncstring_change_after">
  ): UserQueryMethodReturn<"_user_set_query_syncstring_change_after"> {
    return userQuery._user_set_query_syncstring_change_after.call(
      this,
      ...args,
    );
  }

  _user_set_query_patches_check(
    ...args: UserQueryMethodArgs<"_user_set_query_patches_check">
  ): UserQueryMethodReturn<"_user_set_query_patches_check"> {
    return userQuery._user_set_query_patches_check.call(this, ...args);
  }

  _user_get_query_patches_check(
    ...args: UserQueryMethodArgs<"_user_get_query_patches_check">
  ): UserQueryMethodReturn<"_user_get_query_patches_check"> {
    return userQuery._user_get_query_patches_check.call(this, ...args);
  }

  _user_set_query_cursors_check(
    ...args: UserQueryMethodArgs<"_user_set_query_cursors_check">
  ): UserQueryMethodReturn<"_user_set_query_cursors_check"> {
    return userQuery._user_set_query_cursors_check.call(this, ...args);
  }

  _user_get_query_cursors_check(
    ...args: UserQueryMethodArgs<"_user_get_query_cursors_check">
  ): UserQueryMethodReturn<"_user_get_query_cursors_check"> {
    return userQuery._user_get_query_cursors_check.call(this, ...args);
  }

  _syncstring_access_check(
    ...args: UserQueryMethodArgs<"_syncstring_access_check">
  ): UserQueryMethodReturn<"_syncstring_access_check"> {
    return userQuery._syncstring_access_check.call(this, ...args);
  }

  _syncstrings_check(
    ...args: UserQueryMethodArgs<"_syncstrings_check">
  ): UserQueryMethodReturn<"_syncstrings_check"> {
    return userQuery._syncstrings_check.call(this, ...args);
  }

  updateRetentionData(
    ...args: UserQueryMethodArgs<"updateRetentionData">
  ): UserQueryMethodReturn<"updateRetentionData"> {
    return userQuery.updateRetentionData.call(this, ...args);
  }

  // write an event to the central_log table
  async log(opts: PgMethodOpts<"log">) {
    return runWithCbOpts(opts, (logOpts) => centralLog(logOpts));
  }

  async uncaught_exception(err) {
    return await uncaught_exception(this, err);
  }

  // dump a range of data from the central_log table
  async get_log(
    opts: DbFunctionOptsWithCb<
      typeof get_log,
      Awaited<ReturnType<typeof get_log>>
    >,
  ) {
    return runWithCbResultValue(opts.cb, () => get_log(this, opts));
  }

  // Return every entry x in central_log in the given period of time for
  // which x.event==event and x.value.account_id == account_id.
  async get_user_log(
    opts: DbFunctionOptsWithCb<
      typeof get_user_log,
      Awaited<ReturnType<typeof get_user_log>>
    >,
  ) {
    return runWithCbResultValue(opts.cb, () => get_user_log(this, opts));
  }

  async log_client_error(opts: PgMethodOpts<"log_client_error">) {
    return runWithCbOpts(opts, (logOpts) => log_client_error(this, logOpts));
  }

  async webapp_error(opts: DbFunctionOptsWithCb<typeof webapp_error>) {
    return runWithCbOpts(opts, (logOpts) => webapp_error(this, logOpts));
  }

  async get_client_error_log(
    opts: DbFunctionOptsWithCb<
      typeof get_client_error_log,
      Awaited<ReturnType<typeof get_client_error_log>>
    >,
  ) {
    return runWithCbResultValue(opts.cb, () =>
      get_client_error_log(this, opts),
    );
  }

  async set_server_setting(opts: PgMethodOpts<"set_server_setting">) {
    return runWithCb(opts.cb, () => set_server_setting(this, opts));
  }

  reset_server_settings_cache() {
    return reset_server_settings_cache();
  }

  async get_server_setting(opts: PgMethodOpts<"get_server_setting">) {
    return runWithCbResultValue(opts.cb, () => get_server_setting(this, opts));
  }

  async get_server_settings_cached(
    opts: PgMethodOpts<"get_server_settings_cached">,
  ) {
    return runWithCbResultValue(opts.cb, () => get_server_settings_cached());
  }

  async get_site_settings(opts: PgMethodOpts<"get_site_settings">) {
    return runWithCbResultValue(opts.cb, () => get_site_settings(this));
  }

  server_settings_synctable(
    opts: PgMethodOpts<"server_settings_synctable"> = {},
  ) {
    return server_settings_synctable(this, opts);
  }

  async set_passport_settings(opts: PgMethodOpts<"set_passport_settings">) {
    return await set_passport_settings(this, opts);
  }

  async get_passport_settings(opts: PgMethodOpts<"get_passport_settings">) {
    return await get_passport_settings(this, opts);
  }

  async get_all_passport_settings() {
    return await get_all_passport_settings(this);
  }

  async get_all_passport_settings_cached() {
    return await get_all_passport_settings_cached(this);
  }

  async create_passport(opts: PgMethodOpts<"create_passport">) {
    return await create_passport(this, opts);
  }

  async passport_exists(opts: PgMethodOpts<"passport_exists">) {
    return await passport_exists(this, opts);
  }

  async update_account_and_passport(
    opts: PgMethodOpts<"update_account_and_passport">,
  ) {
    return await update_account_and_passport(this, opts);
  }

  /*
    Creating an account using SSO only.
    */
  async create_sso_account(opts: PgMethodOpts<"create_sso_account">) {
    return runWithCbResultValue(opts.cb, () => createSsoAccount(this, opts));
  }

  async is_admin(opts: PgMethodOpts<"is_admin">) {
    return runWithCbResultValue(opts.cb, () => is_admin(this, opts));
  }

  async user_is_in_group(opts: PgMethodOpts<"user_is_in_group">) {
    return runWithCbResultValue(opts.cb, () => user_is_in_group(this, opts));
  }

  async make_user_admin(opts: PgMethodOpts<"make_user_admin">) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCb(opts.cb, () => make_user_admin(this, opts));
  }

  async count_accounts_created_by(
    opts: PgMethodOpts<"count_accounts_created_by">,
  ) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCbResultValue(opts.cb, () =>
      count_accounts_created_by(this, opts),
    );
  }

  // Completely delete the given account from the database.  This doesn't
  // do any sort of cleanup of things associated with the account!  There
  // is no reason to ever use this, except for testing purposes.
  async delete_account(opts: PgMethodOpts<"delete_account">) {
    return runWithCb(opts.cb, () => deleteAccount(this, opts));
  }

  // Mark the account as deleted, thus freeing up the email
  // address for use by another account, etc.  The actual
  // account entry remains in the database, since it may be
  // referred to by many other things (projects, logs, etc.).
  // However, the deleted field is set to true, so the account
  // is excluded from user search.
  // TODO: rewritten in packages/server/accounts/delete.ts
  async mark_account_deleted(opts: PgMethodOpts<"mark_account_deleted">) {
    return runWithCb(opts.cb, () => markAccountDeleted(this, opts));
  }

  async account_exists(opts: PgMethodOpts<"account_exists">) {
    return runWithCbResultValue(opts.cb, () => account_exists(this, opts));
  }

  // set an account creation action, or return all of them for the given email address
  async account_creation_actions(
    opts: PgMethodOpts<"account_creation_actions">,
  ) {
    return runWithCbResultValue(opts.cb, () =>
      accountCreationActions(this, opts),
    );
  }

  async account_creation_actions_success(
    opts: PgMethodOpts<"account_creation_actions_success">,
  ) {
    return runWithCb(opts.cb, () => accountCreationActionsSuccess(this, opts));
  }

  // DEPRECATED: use import accountCreationActions from "@cocalc/server/accounts/account-creation-actions"; instead!!!!
  async do_account_creation_actions(
    opts: PgMethodOpts<"do_account_creation_actions">,
  ) {
    return runWithCb(opts.cb, () => doAccountCreationActions(this, opts));
  }

  async verify_email_create_token(
    opts: PgMethodOpts<"verify_email_create_token">,
  ) {
    return runWithCbResultValue(opts.cb, () =>
      verifyEmailCreateToken(this, opts),
    );
  }

  async verify_email_check_token(
    opts: PgMethodOpts<"verify_email_check_token">,
  ) {
    return runWithCb(opts.cb, () => verifyEmailCheckToken(this, opts));
  }

  async verify_email_get(opts: PgMethodOpts<"verify_email_get">) {
    return runWithCbResultValue(opts.cb, () => verifyEmailGet(this, opts));
  }

  async is_verified_email(opts: PgMethodOpts<"is_verified_email">) {
    return runWithCbResultValue(opts.cb, () => isVerifiedEmail(this, opts));
  }

  /*
    Auxiliary billing related queries
    */
  async get_coupon_history(opts: PgMethodOpts<"get_coupon_history">) {
    return runWithCbResultValue(opts.cb, () => getCouponHistory(this, opts));
  }

  async update_coupon_history(opts: PgMethodOpts<"update_coupon_history">) {
    return runWithCb(opts.cb, () => updateCouponHistory(this, opts));
  }

  /*
    Querying for searchable information about accounts.
    */
  async account_ids_to_usernames(
    opts: PgMethodOpts<"account_ids_to_usernames">,
  ) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCbResultValue(opts.cb, () =>
      accountIdsToUsernames(this, opts),
    );
  }

  _account_where(opts): Record<string, string | string[]> {
    return accountWhere(opts);
  }

  async get_account(opts: PgMethodOpts<"get_account">) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCbResultValue(opts.cb, () => get_account(this, opts));
  }

  // check whether or not a user is banned
  async is_banned_user(opts: PgMethodOpts<"is_banned_user">) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCbResultValue(opts.cb, () => is_banned_user(this, opts));
  }

  async _touch_account(account_id, cb) {
    return runWithCb(cb, () => touchAccount(this, account_id));
  }

  async _touch_project(project_id, account_id, cb) {
    return runWithCb(cb, () =>
      touchProjectInternal(this, project_id, account_id),
    );
  }

  // Indicate activity by a user, possibly on a specific project, and
  // then possibly on a specific path in that project.
  async touch(opts: PgMethodOpts<"touch">) {
    return runWithCb(opts.cb, () => touch(this, opts));
  }

  // Invalidate all outstanding remember me cookies for the given account by
  // deleting them from the remember_me key:value store.
  async invalidate_all_remember_me(
    opts: PgMethodOpts<"invalidate_all_remember_me">,
  ) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCb(opts.cb, () => invalidate_all_remember_me(this, opts));
  }

  // Get remember me cookie with given hash.  If it has expired,
  // **get back undefined instead**.  (Actually deleting expired).
  // We use retry_until_success, since an intermittent database
  // reconnect can result in a cb error that will very soon
  // work fine, and we don't to flat out sign the client out
  // just because of this.
  async get_remember_me(opts: PgMethodOpts<"get_remember_me">) {
    let signed_in: SignedInMessage | undefined = undefined;
    try {
      signed_in = await get_remember_me_message(this, opts);
    } catch (err) {
      opts.cb(err);
      return;
    }
    if (signed_in) {
      opts.cb(undefined, signed_in);
    } else {
      opts.cb();
    }
  }

  async delete_remember_me(opts: PgMethodOpts<"delete_remember_me">) {
    return runWithCb(opts.cb, () => delete_remember_me(this, opts));
  }

  async get_personal_user() {
    return await get_personal_user(this);
  }

  /*
   * Changing password/email, etc. sensitive info about a user
   */

  // Change the password for the given account.
  async change_password(opts: PgMethodOpts<"change_password">) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCb(opts.cb, () => change_password(this, opts));
  }

  // Reset Password MEANT FOR INTERACTIVE USE -- if password is not given, will prompt for it.
  async reset_password(opts: PgMethodOpts<"reset_password">) {
    return runWithCb(opts.cb, () => reset_password(this, opts));
  }

  // Change the email address, unless the email_address we're changing to is already taken.
  // If there is a stripe customer ID, we also call the update process to maybe sync the changed email address
  async change_email_address(opts: PgMethodOpts<"change_email_address">) {
    return runWithCbOrThrow(opts.cb, () => changeEmailAddress(this, opts));
  }

  /*
    Password reset
    */
  async set_password_reset(opts: PgMethodOpts<"set_password_reset">) {
    return runWithCbResultValue(opts.cb, () => set_password_reset(this, opts));
  }

  async get_password_reset(opts: PgMethodOpts<"get_password_reset">) {
    return runWithCbResultValue(opts.cb, () => get_password_reset(this, opts));
  }

  async delete_password_reset(opts: PgMethodOpts<"delete_password_reset">) {
    return runWithCb(opts.cb, () => delete_password_reset(this, opts));
  }

  async record_password_reset_attempt(
    opts: PgMethodOpts<"record_password_reset_attempt">,
  ) {
    return runWithCb(opts.cb, () => record_password_reset_attempt(this, opts));
  }

  async count_password_reset_attempts(
    opts: PgMethodOpts<"count_password_reset_attempts">,
  ) {
    return runWithCbResultValue(opts.cb, () =>
      count_password_reset_attempts(this, opts),
    );
  }

  /*
    Tracking file access

    log_file_access is throttled in each server, in the sense that
    if it is called with the same input within a minute, those
    subsequent calls are ignored.  Of course, if multiple servers
    are recording file_access then there can be more than one
    entry per minute.
    */
  async log_file_access(opts: DbFunctionOptsWithCb<typeof log_file_access>) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCb(opts.cb, () => log_file_access(this, opts));
  }

  async get_file_access(
    opts: DbFunctionOptsWithCb<
      typeof get_file_access,
      Awaited<ReturnType<typeof get_file_access>>
    >,
  ) {
    return runWithCbResultValue(opts.cb, () => get_file_access(this, opts));
  }

  async record_file_use(opts: DbFunctionOptsWithCb<typeof record_file_use>) {
    return runWithCb(opts.cb, () => record_file_use(this, opts));
  }

  async get_file_use(
    opts: DbFunctionOptsWithCb<
      typeof get_file_use,
      Awaited<ReturnType<typeof get_file_use>>
    >,
  ) {
    return runWithCbResultValue(opts.cb, () => get_file_use(this, opts));
  }

  _validate_opts(opts: PgMethodOpts<"_validate_opts">) {
    try {
      return validateOpts(opts);
    } catch (err) {
      opts.cb?.(err.message);
      return false;
    }
  }

  async get_project(opts: PgMethodOpts<"get_project">) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCbResultValue(opts.cb, () => get_project(this, opts));
  }

  async _get_project_column(column, project_id, cb) {
    return runWithCbResultValue(cb, () =>
      _get_project_column(this, column, project_id),
    );
  }

  async get_user_column(column, account_id, cb) {
    return runWithCbResultValue(cb, () =>
      get_user_column(this, column, account_id),
    );
  }

  async add_user_to_project(opts: PgMethodOpts<"add_user_to_project">) {
    return runWithCb(opts.cb, () => addUserToProject(this, opts));
  }

  async set_project_status(opts: PgMethodOpts<"set_project_status">) {
    return runWithCb(opts.cb, () => setProjectStatus(this, opts));
  }

  // Remove the given collaborator from the project.
  // Attempts to remove an *owner* via this function will silently fail (change their group first),
  // as will attempts to remove a user not on the project, or to remove from a non-existent project.
  async remove_collaborator_from_project(
    opts: PgMethodOpts<"remove_collaborator_from_project">,
  ) {
    return runWithCb(opts.cb, () => removeCollaboratorFromProject(this, opts));
  }

  // remove any user, even an owner.
  async remove_user_from_project(
    opts: PgMethodOpts<"remove_user_from_project">,
  ) {
    return runWithCb(opts.cb, () => removeUserFromProject(this, opts));
  }

  // Return a list of the account_id's of all collaborators of the given users.
  async get_collaborator_ids(opts: PgMethodOpts<"get_collaborator_ids">) {
    const dbg = this._dbg("get_collaborator_ids");
    dbg();
    return runWithCbResultValue(opts.cb, () =>
      get_collaborator_ids(this, opts),
    );
  }

  // get list of project collaborator IDs
  async get_collaborators(opts: PgMethodOpts<"get_collaborators">) {
    const dbg = this._dbg("get_collaborators");
    dbg();
    return runWithCbResultValue(opts.cb, () => get_collaborators(this, opts));
  }

  // return list of paths that are public and not disabled in the given project
  async get_public_paths(opts: PgMethodOpts<"get_public_paths">) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCbResultValue(opts.cb, () => get_public_paths(this, opts));
  }

  async has_public_path(opts: PgMethodOpts<"has_public_path">) {
    return runWithCbResultValue(opts.cb, () => has_public_path(this, opts));
  }

  async path_is_public(opts: PgMethodOpts<"path_is_public">) {
    return runWithCbResultValue(opts.cb, () => path_is_public(this, opts));
  }

  async filter_public_paths(opts: PgMethodOpts<"filter_public_paths">) {
    return runWithCbResultValue(opts.cb, () => filter_public_paths(this, opts));
  }

  // Set last_edited for this project to right now, and possibly update its size.
  // It is safe and efficient to call this function very frequently since it will
  // actually hit the database at most once every 30s (per project, per client).  In particular,
  // once called, it ignores subsequent calls for the same project for 30s.
  async touch_project(opts: PgMethodOpts<"touch_project">) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCb(opts.cb, () => touchProject(this, opts));
  }

  async recently_modified_projects(
    opts: PgMethodOpts<"recently_modified_projects">,
  ) {
    return runWithCbResultValue(opts.cb, () =>
      recently_modified_projects(this, opts),
    );
  }

  async get_open_unused_projects(
    opts: PgMethodOpts<"get_open_unused_projects">,
  ) {
    return runWithCbResultValue(opts.cb, () =>
      get_open_unused_projects(this, opts),
    );
  }

  // cb(err, true if user is in one of the groups for the project **or an admin**)
  async user_is_in_project_group(
    opts: PgMethodOpts<"user_is_in_project_group">,
  ) {
    if (opts.account_id == null) {
      opts.cb(undefined, false);
      return;
    }
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCbResultValue(opts.cb, () =>
      user_is_in_project_group(this, opts),
    );
  }

  // cb(err, true if user is an actual collab; ADMINS do not count)
  async user_is_collaborator(opts: PgMethodOpts<"user_is_collaborator">) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCbResultValue(opts.cb, () =>
      user_is_collaborator(this, opts),
    );
  }

  // all id's of projects having anything to do with the given account
  async get_project_ids_with_user(
    opts: PgMethodOpts<"get_project_ids_with_user">,
  ) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCbResultValue(opts.cb, () =>
      get_project_ids_with_user(this, opts),
    );
  }

  // cb(err, array of account_id's of accounts in non-invited-only groups)
  // TODO: add something about invited users too and show them in UI!
  async get_account_ids_using_project(
    opts: PgMethodOpts<"get_account_ids_using_project">,
  ) {
    if (!this._validate_opts(opts)) {
      return;
    }
    return runWithCbResultValue(opts.cb, () =>
      get_account_ids_using_project(this, opts),
    );
  }

  // Have we successfully (no error) sent an invite to the given email address?
  // If so, returns timestamp of when.
  // If not, returns 0.
  async when_sent_project_invite(
    opts: PgMethodOpts<"when_sent_project_invite">,
  ) {
    return runWithCbResultValue(opts.cb, () =>
      whenSentProjectInvite(this, opts),
    );
  }

  // call this to record that we have sent an email invite to the given email address
  async sent_project_invite(opts: PgMethodOpts<"sent_project_invite">) {
    return runWithCb(opts.cb, () => sentProjectInvite(this, opts));
  }

  /*
    Project host, storage location, and state.
    */
  async set_project_host(opts: PgMethodOpts<"set_project_host">) {
    return runWithCbResultValue(opts.cb, () => setProjectHost(this, opts));
  }

  async unset_project_host(opts: PgMethodOpts<"unset_project_host">) {
    return runWithCb(opts.cb, () => unsetProjectHost(this, opts));
  }

  async get_project_host(opts: PgMethodOpts<"get_project_host">) {
    return runWithCbResultValue(opts.cb, () => getProjectHost(this, opts));
  }

  async set_project_storage(opts: PgMethodOpts<"set_project_storage">) {
    return runWithCbResultValue(opts.cb, () => setProjectStorage(this, opts));
  }

  async get_project_storage(opts: PgMethodOpts<"get_project_storage">) {
    return runWithCbResultValue(opts.cb, () => getProjectStorage(this, opts));
  }

  async update_project_storage_save(
    opts: PgMethodOpts<"update_project_storage_save">,
  ) {
    return runWithCb(opts.cb, () => updateProjectStorageSave(this, opts));
  }

  async set_project_storage_request(
    opts: PgMethodOpts<"set_project_storage_request">,
  ) {
    return runWithCb(opts.cb, () => setProjectStorageRequest(this, opts));
  }

  async get_project_storage_request(
    opts: PgMethodOpts<"get_project_storage_request">,
  ) {
    return runWithCbResultValue(opts.cb, () =>
      getProjectStorageRequest(this, opts),
    );
  }

  async set_project_state(opts: PgMethodOpts<"set_project_state">) {
    return runWithCb(opts.cb, () => setProjectState(this, opts));
  }

  async get_project_state(opts: PgMethodOpts<"get_project_state">) {
    return runWithCbResultValue(opts.cb, () => getProjectState(this, opts));
  }

  /*
    Project quotas and upgrades
    */

  // Returns the total quotas for the project, including any
  // upgrades to the base settings.
  async get_project_quotas(opts: PgMethodOpts<"get_project_quotas">) {
    return runWithCbResultValue(opts.cb, () => getProjectQuotas(this, opts));
  }

  async get_user_project_upgrades(
    opts: PgMethodOpts<"get_user_project_upgrades">,
  ) {
    return runWithCbResultValue(opts.cb, () =>
      getUserProjectUpgrades(this, opts),
    );
  }

  async ensure_user_project_upgrades_are_valid(
    opts: PgMethodOpts<"ensure_user_project_upgrades_are_valid">,
  ) {
    return runWithCbResultValue(opts.cb, () =>
      ensureUserProjectUpgradesAreValid(this, opts),
    );
  }

  async ensure_all_user_project_upgrades_are_valid(
    opts: PgMethodOpts<"ensure_all_user_project_upgrades_are_valid">,
  ) {
    return runWithCb(opts.cb, () =>
      ensureAllUserProjectUpgradesAreValid(this, opts),
    );
  }

  async get_project_upgrades(opts: PgMethodOpts<"get_project_upgrades">) {
    return runWithCbResultValue(opts.cb, () => getProjectUpgrades(this, opts));
  }

  async remove_all_user_project_upgrades(
    opts: RemoveAllUserProjectUpgradesOptions & { cb: CB },
  ) {
    return runWithCbOrThrow(opts.cb, () =>
      removeAllUserProjectUpgrades(this, opts),
    );
  }

  /*
    Project settings
    */
  async get_project_settings(opts: PgMethodOpts<"get_project_settings">) {
    return runWithCbResultValue(opts.cb, () => getProjectSettings(this, opts));
  }

  async set_project_settings(opts: PgMethodOpts<"set_project_settings">) {
    return runWithCb(opts.cb, () => setProjectSettings(this, opts));
  }

  async get_project_extra_env(opts: PgMethodOpts<"get_project_extra_env">) {
    return runWithCbResultValue(opts.cb, () => getProjectExtraEnv(this, opts));
  }

  async recent_projects(opts: RecentProjectsOptionsWithCb) {
    const { cb, ...queryOpts } = opts;
    return runWithCbResultValue(cb, () => recentProjects(this, queryOpts));
  }

  async get_stats_interval(opts: PgMethodOpts<"get_stats_interval">) {
    return runWithCbResultValue(opts.cb, () => get_stats_interval(this, opts));
  }

  // If there is a cached version of stats (which has given ttl) return that -- this could have
  // been computed by any of the hubs.  If there is no cached version, compute new one and store
  // in cache for ttl seconds.
  async get_stats(
    opts: DbFunctionOpts<typeof calc_stats>,
  ): Promise<Stats | null | undefined> {
    return await calc_stats(this, opts);
  }

  async get_active_student_stats(
    opts: PgMethodOpts<"get_active_student_stats">,
  ) {
    return runWithCbResultValue(opts.cb, () => get_active_student_stats(this));
  }

  /*
    Hub servers
    */
  async register_hub(opts: PgMethodOpts<"register_hub">) {
    return runWithCb(opts.cb, () => register_hub(this, opts));
  }

  async get_hub_servers(opts: PgMethodOpts<"get_hub_servers">) {
    return runWithCbResultValue(opts.cb, () => get_hub_servers(this));
  }

  /*
    Custom software images
    */

  // this is 100% for cc-in-cc dev projects only!
  // Delete all patches, the blobs if archived, and the syncstring object itself
  // Basically this erases everything from cocalc related to the file edit history
  // of a given file... except ZFS snapshots.
  async insert_random_compute_images(
    opts: PgMethodOpts<"insert_random_compute_images">,
  ) {
    return runWithCb(opts.cb, () => insert_random_compute_images(this, opts));
  }

  // Delete all patches, the blobs if archived, and the syncstring object itself
  // Basically this erases everything from cocalc related to the file edit history
  // of a given file... except ZFS snapshots.
  async delete_syncstring(opts: PgMethodOpts<"delete_syncstring">) {
    return runWithCb(opts.cb, () => delete_syncstring(this, opts));
  }

  async site_license_usage_stats() {
    return await site_license_usage_stats(this);
  }

  async projects_using_site_license(
    opts: DbFunctionOpts<typeof projects_using_site_license>,
  ) {
    return await projects_using_site_license(this, opts);
  }

  async number_of_projects_using_site_license(
    opts: DbFunctionOpts<typeof number_of_projects_using_site_license>,
  ) {
    return await number_of_projects_using_site_license(this, opts);
  }

  async site_license_public_info(license_id) {
    return await site_license_public_info(this, license_id);
  }

  async site_license_manager_set(license_id, info) {
    return await site_license_manager_set(this, license_id, info);
  }

  async update_site_license_usage_log() {
    return await update_site_license_usage_log(this);
  }

  async matching_site_licenses(search: string, limit: number = 5) {
    return await matching_site_licenses(this, search, limit);
  }

  async manager_site_licenses(account_id: string) {
    return await manager_site_licenses(this, account_id);
  }

  async project_datastore_set(
    account_id: string,
    project_id: string,
    config: any,
  ) {
    return await project_datastore_set(this, account_id, project_id, config);
  }

  async project_datastore_get(account_id: string, project_id: string) {
    return await project_datastore_get(this, account_id, project_id);
  }

  async project_datastore_del(
    account_id: string,
    project_id: string,
    name: string,
  ) {
    return await project_datastore_del(this, account_id, project_id, name);
  }

  async permanently_unlink_all_deleted_projects_of_user(
    account_id_or_email_address,
  ) {
    return await permanently_unlink_all_deleted_projects_of_user(
      this,
      account_id_or_email_address,
    );
  }

  async unlink_old_deleted_projects() {
    return await unlink_old_deleted_projects(this);
  }

  async unlist_all_public_paths(account_id, is_owner) {
    return await unlist_all_public_paths(this, account_id, is_owner);
  }

  async projects_that_need_to_be_started() {
    return await projects_that_need_to_be_started(this);
  }

  // this *merges* in the run_quota; it doesn't replace it.
  async set_run_quota(project_id, run_quota) {
    return await setRunQuota(this, project_id, run_quota);
  }

  // true if they are a manager on a license or have any subscriptions.
  async is_paying_customer(account_id) {
    return await is_paying_customer(this, account_id);
  }

  async get_all_public_paths(account_id) {
    return await get_all_public_paths(this, account_id);
  }

  // Return true if the given account is a member or
  // owner of the given organization.
  async accountIsInOrganization(opts: PgMethodOpts<"accountIsInOrganization">) {
    return await accountIsInOrganization(this, opts);
  }

  // given a name, returns undefined if it is not in use,
  // and the account_id or organization_id that is using it
  // if it is in use.
  async nameToAccountOrOrganization(name) {
    return await nameToAccountOrOrganization(this, name);
  }

  async registrationTokens(options, query) {
    return await registrationTokens(this, options, query);
  }

  async updateUnreadMessageCount(
    opts: FunctionOpts<typeof updateUnreadMessageCount>,
  ) {
    return await updateUnreadMessageCount(opts);
  }

  _get_backup_tables(tables: BackupTables): string[] {
    return getBackupTables(tables);
  }
}
