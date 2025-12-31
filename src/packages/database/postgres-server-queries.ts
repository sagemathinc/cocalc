/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
PostgreSQL -- implementation of all the queries needed for the backend servers

These are all the non-reactive non-push queries, e.g., adding entries to logs,
checking on cookies, creating accounts and projects, etc.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : MS-RSL
*/

import { bind_methods } from "@cocalc/util/misc";
import { required } from "@cocalc/util/opts";

import type { PostgreSQL as PostgreSQLInterface } from "./postgres/types";

const normalizeOpts = <T extends Record<string, unknown>>(
  opts: T | undefined,
  defaults: T,
): T => {
  const normalized = { ...defaults, ...(opts ?? {}) } as T;
  for (const [key, value] of Object.entries(defaults)) {
    if (value === required && normalized[key] == null) {
      throw new Error(`missing required option '${key}'`);
    }
  }
  return normalized;
};

type PostgreSQLConstructor = new (...args: any[]) => PostgreSQLInterface;

// IDK why, but if that import line is down below, where the other "./postgres/*" imports are, building manage
// fails with: remember-me.ts(15,31): error TS2307: Cannot find module 'async-await-utils/hof' or its corresponding type declarations.
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
} from "./postgres/project/upgrades";

import { PROJECT_COLUMNS } from "./postgres/project/columns";

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

export function extend_PostgreSQL<TBase extends PostgreSQLConstructor>(
  ext: TBase,
): TBase {
  return class PostgreSQL extends ext {
    // write an event to the central_log table
    constructor(...args: any[]) {
      super(...args);
      bind_methods(this);
    }

    async log(opts) {
      opts = normalizeOpts(opts, {
        event: required, // string
        value: required, // object
        cb: undefined,
      });
      try {
        await centralLog(opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async uncaught_exception(err) {
      return await uncaught_exception(this, err);
    }

    // dump a range of data from the central_log table
    async get_log(opts) {
      opts = normalizeOpts(opts, {
        start: undefined, // if not given start at beginning of time
        end: undefined, // if not given include everything until now
        log: "central_log", // which table to query
        event: undefined,
        where: undefined, // if given, restrict to records with the given json
        // containment, e.g., {account_id:'...'}, only returns
        // entries whose value has the given account_id.
        cb: required,
      });
      try {
        const result = await get_log(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // Return every entry x in central_log in the given period of time for
    // which x.event==event and x.value.account_id == account_id.
    async get_user_log(opts) {
      opts = normalizeOpts(opts, {
        start: undefined,
        end: undefined, // if not given include everything until now
        event: "successful_sign_in",
        account_id: required,
        cb: required,
      });
      try {
        const result = await get_user_log(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async log_client_error(opts) {
      opts = normalizeOpts(opts, {
        event: "event",
        error: "error",
        account_id: undefined,
        cb: undefined,
      });
      try {
        await log_client_error(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async webapp_error(opts) {
      opts = normalizeOpts(opts, {
        account_id: undefined,
        name: undefined,
        message: undefined,
        comment: undefined,
        stacktrace: undefined,
        file: undefined,
        path: undefined,
        lineNumber: undefined,
        columnNumber: undefined,
        severity: undefined,
        browser: undefined,
        mobile: undefined,
        responsive: undefined,
        user_agent: undefined,
        smc_version: undefined,
        build_date: undefined,
        smc_git_rev: undefined,
        uptime: undefined,
        start_time: undefined,
        id: undefined, // ignored
        cb: undefined,
      });
      try {
        await webapp_error(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async get_client_error_log(opts) {
      opts = normalizeOpts(opts, {
        start: undefined, // if not given start at beginning of time
        end: undefined, // if not given include everything until now
        event: undefined,
        cb: required,
      });
      try {
        const result = await get_client_error_log(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async set_server_setting(opts) {
      opts = normalizeOpts(opts, {
        name: required,
        value: required,
        readonly: undefined, // boolean. if yes, that value is not controlled via any UI
        cb: required,
      });
      try {
        await set_server_setting(this, opts);
        return opts.cb();
      } catch (err) {
        return opts.cb(err);
      }
    }

    reset_server_settings_cache() {
      return reset_server_settings_cache();
    }

    async get_server_setting(opts) {
      opts = normalizeOpts(opts, {
        name: required,
        cb: required,
      });
      try {
        const result = await get_server_setting(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async get_server_settings_cached(opts) {
      opts = normalizeOpts(opts, { cb: required });
      try {
        const result = await get_server_settings_cached();
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async get_site_settings(opts) {
      opts = normalizeOpts(opts, { cb: required }); // (err, settings)
      try {
        const result = await get_site_settings(this);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    server_settings_synctable(opts = {}) {
      return server_settings_synctable(this, opts);
    }

    async set_passport_settings(opts) {
      opts = normalizeOpts(opts, {
        strategy: required,
        conf: required,
        info: undefined,
        cb: required,
      });
      return await set_passport_settings(this, opts);
    }

    async get_passport_settings(opts) {
      opts = normalizeOpts(opts, { strategy: required });
      return await get_passport_settings(this, opts);
    }

    async get_all_passport_settings() {
      return await get_all_passport_settings(this);
    }

    async get_all_passport_settings_cached() {
      return await get_all_passport_settings_cached(this);
    }

    async create_passport(opts) {
      return await create_passport(this, opts);
    }

    async passport_exists(opts) {
      return await passport_exists(this, opts);
    }

    async update_account_and_passport(opts) {
      return await update_account_and_passport(this, opts);
    }

    /*
    Creating an account using SSO only.
    */
    async create_sso_account(opts) {
      opts = normalizeOpts(opts, {
        first_name: undefined,
        last_name: undefined,

        created_by: undefined, //  ip address of computer creating this account

        email_address: undefined,
        password_hash: undefined,
        lti_id: undefined, // 2-tuple <string[]>[iss, user_id]

        passport_strategy: undefined,
        passport_id: undefined,
        passport_profile: undefined,
        usage_intent: undefined,
        cb: required,
      }); // cb(err, account_id)
      try {
        const account_id = await createSsoAccount(this, opts);
        return opts.cb(undefined, account_id);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async is_admin(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        cb: required,
      });
      try {
        const result = await is_admin(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async user_is_in_group(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        group: required,
        cb: required,
      });
      try {
        const result = await user_is_in_group(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async make_user_admin(opts) {
      opts = normalizeOpts(opts, {
        account_id: undefined,
        email_address: undefined,
        cb: required,
      });
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        await make_user_admin(this, opts);
        return opts.cb();
      } catch (err) {
        return opts.cb(err);
      }
    }

    async count_accounts_created_by(opts) {
      opts = normalizeOpts(opts, {
        ip_address: required,
        age_s: required,
        cb: required,
      });
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        const result = await count_accounts_created_by(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // Completely delete the given account from the database.  This doesn't
    // do any sort of cleanup of things associated with the account!  There
    // is no reason to ever use this, except for testing purposes.
    async delete_account(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        cb: required,
      });
      try {
        await deleteAccount(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    // Mark the account as deleted, thus freeing up the email
    // address for use by another account, etc.  The actual
    // account entry remains in the database, since it may be
    // referred to by many other things (projects, logs, etc.).
    // However, the deleted field is set to true, so the account
    // is excluded from user search.
    // TODO: rewritten in packages/server/accounts/delete.ts
    async mark_account_deleted(opts) {
      opts = normalizeOpts(opts, {
        account_id: undefined,
        email_address: undefined,
        cb: required,
      });
      try {
        await markAccountDeleted(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    async account_exists(opts) {
      opts = normalizeOpts(opts, {
        email_address: required,
        cb: required,
      }); // cb(err, account_id or undefined) -- actual account_id if it exists; err = problem with db connection...
      try {
        const result = await account_exists(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // set an account creation action, or return all of them for the given email address
    async account_creation_actions(opts) {
      opts = normalizeOpts(opts, {
        email_address: required,
        action: undefined, // if given, adds this action; if not, returns all non-expired actions
        ttl: 60 * 60 * 24 * 14, // add action with this ttl in seconds (default: 2 weeks)
        cb: required,
      }); // if ttl not given cb(err, [array of actions])
      try {
        const result = await accountCreationActions(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    async account_creation_actions_success(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        cb: required,
      });
      try {
        await accountCreationActionsSuccess(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    // DEPRECATED: use import accountCreationActions from "@cocalc/server/accounts/account-creation-actions"; instead!!!!
    async do_account_creation_actions(opts) {
      opts = normalizeOpts(opts, {
        email_address: required,
        account_id: required,
        cb: required,
      });
      try {
        await doAccountCreationActions(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    async verify_email_create_token(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        cb: undefined,
      });
      try {
        const result = await verifyEmailCreateToken(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    async verify_email_check_token(opts) {
      opts = normalizeOpts(opts, {
        email_address: required,
        token: required,
        cb: undefined,
      });
      try {
        await verifyEmailCheckToken(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    async verify_email_get(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        cb: undefined,
      });
      try {
        const result = await verifyEmailGet(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    async is_verified_email(opts) {
      opts = normalizeOpts(opts, {
        email_address: required,
        cb: required,
      });
      try {
        const verified = await isVerifiedEmail(this, opts);
        return opts.cb(undefined, verified);
      } catch (err) {
        return opts.cb(err.message != null ? err.message : err);
      }
    }

    /*
    Auxiliary billing related queries
    */
    async get_coupon_history(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        cb: undefined,
      });
      try {
        const result = await getCouponHistory(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async update_coupon_history(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        coupon_history: required,
        cb: undefined,
      });
      try {
        await updateCouponHistory(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    /*
    Querying for searchable information about accounts.
    */
    async account_ids_to_usernames(opts) {
      opts = normalizeOpts(opts, {
        account_ids: required,
        cb: required,
      }); // (err, mapping {account_id:{first_name:?, last_name:?}})
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        const result = await accountIdsToUsernames(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    _account_where(opts) {
      return accountWhere(opts);
    }

    async get_account(opts) {
      opts = normalizeOpts(opts, {
        email_address: undefined,
        account_id: undefined,
        lti_id: undefined,
        columns: undefined,
        cb: required,
      });
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        const result = await get_account(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // check whether or not a user is banned
    async is_banned_user(opts) {
      opts = normalizeOpts(opts, {
        email_address: undefined,
        account_id: undefined,
        cb: required,
      });
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        const result = await is_banned_user(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async _touch_account(account_id, cb) {
      try {
        await touchAccount(this, account_id);
        return cb();
      } catch (err) {
        return cb(err);
      }
    }

    async _touch_project(project_id, account_id, cb) {
      try {
        await touchProjectInternal(this, project_id, account_id);
        return cb();
      } catch (err) {
        return cb(err);
      }
    }

    // Indicate activity by a user, possibly on a specific project, and
    // then possibly on a specific path in that project.
    async touch(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        project_id: undefined,
        path: undefined,
        action: "edit",
        ttl_s: 50, // min activity interval; calling this function with same input again within this interval is ignored
        cb: undefined,
      });
      try {
        await touch(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    // Invalidate all outstanding remember me cookies for the given account by
    // deleting them from the remember_me key:value store.
    async invalidate_all_remember_me(opts) {
      opts = normalizeOpts(opts, {
        account_id: undefined,
        email_address: undefined,
        cb: undefined,
      });
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        await invalidate_all_remember_me(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    // Get remember me cookie with given hash.  If it has expired,
    // **get back undefined instead**.  (Actually deleting expired).
    // We use retry_until_success, since an intermittent database
    // reconnect can result in a cb error that will very soon
    // work fine, and we don't to flat out sign the client out
    // just because of this.
    async get_remember_me(opts) {
      opts = normalizeOpts(opts, {
        hash: required,
        cache: true,
        cb: required,
      }); // cb(err, signed_in_message | undefined)
      let signed_in: SignedInMessage | undefined = undefined;
      try {
        signed_in = await get_remember_me_message(this, opts);
      } catch (err) {
        opts.cb(err);
        return;
      }
      if (signed_in) {
        return opts.cb(undefined, signed_in);
      } else {
        return opts.cb();
      }
    }

    async delete_remember_me(opts) {
      opts = normalizeOpts(opts, {
        hash: required,
        cb: undefined,
      });
      try {
        await delete_remember_me(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    // ASYNC FUNCTION
    async get_personal_user() {
      return await get_personal_user(this);
    }

    /*
     * Changing password/email, etc. sensitive info about a user
     */

    // Change the password for the given account.
    async change_password(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        password_hash: required,
        invalidate_remember_me: true,
        cb: required,
      });
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        await change_password(this, opts);
        return opts.cb();
      } catch (err) {
        return opts.cb(err);
      }
    }

    // Reset Password MEANT FOR INTERACTIVE USE -- if password is not given, will prompt for it.
    async reset_password(opts) {
      opts = normalizeOpts(opts, {
        email_address: undefined,
        account_id: undefined,
        password: undefined,
        random: true, // if true (the default), will generate and print a random password.
        cb: undefined,
      });
      try {
        await reset_password(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    // Change the email address, unless the email_address we're changing to is already taken.
    // If there is a stripe customer ID, we also call the update process to maybe sync the changed email address
    async change_email_address(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        email_address: required,
        stripe: required,
        cb: required,
      });
      try {
        await changeEmailAddress(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    /*
    Password reset
    */
    async set_password_reset(opts) {
      opts = normalizeOpts(opts, {
        email_address: required,
        ttl: required,
        cb: required,
      }); // cb(err, uuid)
      try {
        const id = await set_password_reset(this, opts);
        return opts.cb(undefined, id);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async get_password_reset(opts) {
      opts = normalizeOpts(opts, {
        id: required,
        cb: required,
      }); // cb(err, true if allowed and false if not)
      try {
        const result = await get_password_reset(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async delete_password_reset(opts) {
      opts = normalizeOpts(opts, {
        id: required,
        cb: required,
      }); // cb(err, true if allowed and false if not)
      try {
        await delete_password_reset(this, opts);
        return opts.cb();
      } catch (err) {
        return opts.cb(err);
      }
    }

    async record_password_reset_attempt(opts) {
      opts = normalizeOpts(opts, {
        email_address: required,
        ip_address: required,
        ttl: required,
        cb: required,
      }); // cb(err)
      try {
        await record_password_reset_attempt(this, opts);
        return opts.cb();
      } catch (err) {
        return opts.cb(err);
      }
    }

    async count_password_reset_attempts(opts) {
      opts = normalizeOpts(opts, {
        email_address: undefined, // must give one of email_address or ip_address
        ip_address: undefined,
        age_s: required, // at most this old
        cb: required,
      }); // cb(err)
      try {
        const result = await count_password_reset_attempts(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    /*
    Tracking file access

    log_file_access is throttled in each server, in the sense that
    if it is called with the same input within a minute, those
    subsequent calls are ignored.  Of course, if multiple servers
    are recording file_access then there can be more than one
    entry per minute.
    */
    async log_file_access(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        account_id: required,
        filename: required,
        cb: undefined,
      });
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        await log_file_access(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    /*
    Efficiently get all files access times subject to various constraints...

    NOTE: this was not available in RethinkDB version (too painful to implement!), but here it is,
    easily sliceable in any way.  This could be VERY useful for users!
    */
    async get_file_access(opts) {
      opts = normalizeOpts(opts, {
        start: undefined, // start time
        end: undefined, // end time
        project_id: undefined,
        account_id: undefined,
        filename: undefined,
        cb: required,
      });
      try {
        const result = await get_file_access(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    /*
    File editing activity -- users modifying files in any way
      - one single table called file_activity
      - table also records info about whether or not activity has been seen by users
    */
    async record_file_use(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        path: required,
        account_id: required,
        action: required, // 'edit', 'read', 'seen', 'chat', etc.?
        cb: required,
      });
      try {
        await record_file_use(this, opts);
        return opts.cb();
      } catch (err) {
        return opts.cb(err);
      }
    }

    async get_file_use(opts) {
      opts = normalizeOpts(opts, {
        max_age_s: undefined,
        project_id: undefined, // don't specify both project_id and project_ids
        project_ids: undefined,
        path: undefined, // if given, project_id must be given
        cb: required,
      }); // one entry if path given; otherwise, an array of entries.
      try {
        const result = await get_file_use(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    _validate_opts(opts) {
      try {
        return validateOpts(opts);
      } catch (err) {
        opts.cb?.(err.message);
        return false;
      }
    }

    async get_project(opts) {
      opts = normalizeOpts(opts, {
        project_id: required, // an array of id's
        columns: PROJECT_COLUMNS,
        cb: required,
      });
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        const result = await get_project(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async _get_project_column(column, project_id, cb) {
      try {
        const result = await _get_project_column(this, column, project_id);
        return cb(undefined, result);
      } catch (err) {
        return cb(err);
      }
    }

    async get_user_column(column, account_id, cb) {
      try {
        const result = await get_user_column(this, column, account_id);
        return cb(undefined, result);
      } catch (err) {
        return cb(err);
      }
    }

    async add_user_to_project(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        account_id: required,
        group: "collaborator", // see misc.PROJECT_GROUPS above
        cb: undefined,
      });
      try {
        await addUserToProject(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    async set_project_status(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        status: required,
        cb: undefined,
      });
      try {
        await setProjectStatus(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    // Remove the given collaborator from the project.
    // Attempts to remove an *owner* via this function will silently fail (change their group first),
    // as will attempts to remove a user not on the project, or to remove from a non-existent project.
    async remove_collaborator_from_project(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        account_id: required,
        cb: undefined,
      });
      try {
        await removeCollaboratorFromProject(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    // remove any user, even an owner.
    async remove_user_from_project(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        account_id: required,
        cb: undefined,
      });
      try {
        await removeUserFromProject(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    // Return a list of the account_id's of all collaborators of the given users.
    async get_collaborator_ids(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        cb: required,
      });
      const dbg = this._dbg("get_collaborator_ids");
      dbg();
      try {
        const result = await get_collaborator_ids(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // get list of project collaborator IDs
    async get_collaborators(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: required,
      });
      const dbg = this._dbg("get_collaborators");
      dbg();
      try {
        const result = await get_collaborators(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // return list of paths that are public and not disabled in the given project
    async get_public_paths(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: required,
      });
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        const result = await get_public_paths(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async has_public_path(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: required,
      }); // cb(err, has_public_path)
      try {
        const result = await has_public_path(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async path_is_public(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        path: required,
        cb: required,
      });
      try {
        const result = await path_is_public(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async filter_public_paths(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        path: required,
        listing: required, // files in path [{name:..., isdir:boolean, ....}, ...]
        cb: required,
      });
      try {
        const result = await filter_public_paths(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // Set last_edited for this project to right now, and possibly update its size.
    // It is safe and efficient to call this function very frequently since it will
    // actually hit the database at most once every 30s (per project, per client).  In particular,
    // once called, it ignores subsequent calls for the same project for 30s.
    async touch_project(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: undefined,
      });
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        await touchProject(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async recently_modified_projects(opts) {
      opts = normalizeOpts(opts, {
        max_age_s: required,
        cb: required,
      });
      try {
        const result = await recently_modified_projects(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async get_open_unused_projects(opts) {
      opts = normalizeOpts(opts, {
        min_age_days: 30, // project must not have been edited in this much time
        max_age_days: 120, // project must have been edited at most this long ago
        host: required, // hostname of where project is opened
        cb: required,
      });
      try {
        const result = await get_open_unused_projects(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // cb(err, true if user is in one of the groups for the project **or an admin**)
    async user_is_in_project_group(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        account_id: undefined,
        groups: ["owner", "collaborator"],
        cache: false, // if true cache result for a few seconds
        cb: required,
      }); // cb(err, true if in group)
      if (opts.account_id == null) {
        // clearly user -- who isn't even signed in -- is not in the group
        opts.cb(undefined, false);
        return;
      }
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        const result = await user_is_in_project_group(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // cb(err, true if user is an actual collab; ADMINS do not count)
    async user_is_collaborator(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        account_id: required,
        cache: true,
        cb: required,
      }); // cb(err, true if is actual collab on project)
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        const result = await user_is_collaborator(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // all id's of projects having anything to do with the given account
    async get_project_ids_with_user(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        is_owner: undefined, // if set to true, only return projects with this owner.
        cb: required,
      }); // opts.cb(err, [project_id, project_id, project_id, ...])
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        const result = await get_project_ids_with_user(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // cb(err, array of account_id's of accounts in non-invited-only groups)
    // TODO: add something about invited users too and show them in UI!
    async get_account_ids_using_project(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: required,
      });
      if (!this._validate_opts(opts)) {
        return;
      }
      try {
        const result = await get_account_ids_using_project(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // Have we successfully (no error) sent an invite to the given email address?
    // If so, returns timestamp of when.
    // If not, returns 0.
    async when_sent_project_invite(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        to: required, // an email address
        cb: required,
      });
      try {
        const result = await whenSentProjectInvite(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    // call this to record that we have sent an email invite to the given email address
    async sent_project_invite(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        to: required, // an email address
        error: undefined, // if there was an error set it to this; leave undefined to mean that sending succeeded
        cb: undefined,
      });
      try {
        await sentProjectInvite(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err.message != null ? err.message : err);
      }
    }

    /*
    Project host, storage location, and state.
    */
    async set_project_host(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        host: required,
        cb: undefined,
      });
      try {
        const result = await setProjectHost(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async unset_project_host(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: undefined,
      });
      try {
        await unsetProjectHost(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async get_project_host(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: undefined,
      });
      try {
        const result = await getProjectHost(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async set_project_storage(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        host: required,
        cb: undefined,
      });
      try {
        const result = await setProjectStorage(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async get_project_storage(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: undefined,
      });
      try {
        const result = await getProjectStorage(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async update_project_storage_save(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: undefined,
      });
      try {
        await updateProjectStorageSave(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async set_project_storage_request(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        action: required, // 'save', 'close', 'open', 'move'
        target: undefined, // needed for 'open' and 'move'
        cb: required,
      });
      try {
        await setProjectStorageRequest(this, opts);
        return opts.cb();
      } catch (err) {
        return opts.cb(err);
      }
    }

    async get_project_storage_request(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: required,
      });
      try {
        const result = await getProjectStorageRequest(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    async set_project_state(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        state: required,
        time: new Date(),
        error: undefined,
        ip: undefined, // optional ip address
        cb: required,
      });
      try {
        await setProjectState(this, opts);
        return opts.cb();
      } catch (err) {
        return opts.cb(err);
      }
    }

    async get_project_state(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: required,
      });
      try {
        const result = await getProjectState(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    /*
    Project quotas and upgrades
    */

    // Returns the total quotas for the project, including any
    // upgrades to the base settings.
    async get_project_quotas(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: required,
      });
      try {
        const result = await getProjectQuotas(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // Return mapping from project_id to map listing the upgrades this particular user
    // applied to the given project.  This only includes project_id's of projects that
    // this user may have upgraded in some way.
    async get_user_project_upgrades(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        cb: required,
      });
      try {
        const result = await getUserProjectUpgrades(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // Ensure that all upgrades applied by the given user to projects are consistent,
    // truncating any that exceed their allotment.  NOTE: Unless there is a bug,
    // the only way the quotas should ever exceed their allotment would be if the
    // user is trying to cheat... *OR* a subscription was canceled or ended.
    async ensure_user_project_upgrades_are_valid(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        fix: true, // if true, will fix projects in database whose quotas exceed the allotted amount; it is the caller's responsibility to actually change them.
        cb: required,
      }); // cb(err, excess)
      try {
        const result = await ensureUserProjectUpgradesAreValid(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // Loop through every user of cocalc that is connected with stripe (so may have a subscription),
    // and ensure that any upgrades that have applied to projects are valid.  It is important to
    // run this periodically or there is a really natural common case where users can cheat:
    //    (1) they apply upgrades to a project
    //    (2) their subscription expires
    //    (3) they do NOT touch upgrades on any projects again.
    async ensure_all_user_project_upgrades_are_valid(opts) {
      opts = normalizeOpts(opts, {
        limit: 1, // We only default to 1 at a time, since there is no hurry.
        cb: required,
      });
      try {
        await ensureAllUserProjectUpgradesAreValid(this, opts);
        return opts.cb();
      } catch (err) {
        return opts.cb(err);
      }
    }

    // Return the sum total of all user upgrades to a particular project
    async get_project_upgrades(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: required,
      });
      try {
        const result = await getProjectUpgrades(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // Remove all upgrades to all projects applied by this particular user.
    async remove_all_user_project_upgrades(opts) {
      opts = normalizeOpts(opts, {
        account_id: required,
        projects: undefined, // if given, only remove from projects with id in this array.
        cb: required,
      });
      try {
        await removeAllUserProjectUpgrades(this, opts);
        return opts.cb();
      } catch (err) {
        return opts.cb(err);
      }
    }

    /*
    Project settings
    */
    async get_project_settings(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: undefined,
      });
      try {
        const result = await getProjectSettings(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async set_project_settings(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        settings: required, // can be any subset of the map
        cb: undefined,
      });
      try {
        await setProjectSettings(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async get_project_extra_env(opts) {
      opts = normalizeOpts(opts, {
        project_id: required,
        cb: undefined,
      });
      try {
        const result = await getProjectExtraEnv(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async recent_projects(opts) {
      opts = normalizeOpts(opts, {
        age_m: required, // return results at most this old
        min_age_m: 0, // only returns results at least this old
        pluck: undefined, // if not given, returns list of project_id's; if given (as an array), returns objects with these fields
        cb: undefined,
      }); // cb(err, list of strings or objects)
      try {
        const result = await recentProjects(this, opts);
        return opts.cb?.(undefined, result);
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    async get_stats_interval(opts) {
      opts = normalizeOpts(opts, {
        start: required,
        end: required,
        cb: required,
      });
      try {
        const result = await get_stats_interval(this, opts);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    // If there is a cached version of stats (which has given ttl) return that -- this could have
    // been computed by any of the hubs.  If there is no cached version, compute new one and store
    // in cache for ttl seconds.
    async get_stats(opts) {
      opts = normalizeOpts(opts, {
        ttl_dt: 15, // 15 secs subtracted from ttl to compensate for computation duration when called via a cronjob
        ttl: 5 * 60, // how long cached version lives (in seconds)
        ttl_db: 30, // how long a valid result from a db query is cached in any case
        update: true, // true: recalculate if older than ttl; false: don't recalculate and pick it from the DB (locally cached for ttl secs)
        cb: undefined,
      });
      return await calc_stats(this, opts);
    }

    async get_active_student_stats(opts) {
      opts = normalizeOpts(opts, { cb: required });
      try {
        const result = await get_active_student_stats(this);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    /*
    Hub servers
    */
    async register_hub(opts) {
      opts = normalizeOpts(opts, {
        host: required,
        port: required,
        clients: required,
        ttl: required,
        cb: required,
      });
      try {
        await register_hub(this, opts);
        return opts.cb();
      } catch (err) {
        return opts.cb(err);
      }
    }

    async get_hub_servers(opts) {
      opts = normalizeOpts(opts, { cb: required });
      try {
        const result = await get_hub_servers(this);
        return opts.cb(undefined, result);
      } catch (err) {
        return opts.cb(err);
      }
    }

    /*
    Custom software images
    */

    // this is 100% for cc-in-cc dev projects only!
    async insert_random_compute_images(opts) {
      opts = normalizeOpts(opts, { cb: required });
      try {
        await insert_random_compute_images(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    // Delete all patches, the blobs if archived, and the syncstring object itself
    // Basically this erases everything from cocalc related to the file edit history
    // of a given file... except ZFS snapshots.
    async delete_syncstring(opts) {
      opts = normalizeOpts(opts, {
        string_id: required,
        cb: required,
      });
      try {
        await delete_syncstring(this, opts);
        return opts.cb?.();
      } catch (err) {
        return opts.cb?.(err);
      }
    }

    // async function
    async site_license_usage_stats() {
      return await site_license_usage_stats(this);
    }

    // async function
    async projects_using_site_license(opts) {
      return await projects_using_site_license(this, opts);
    }

    // async function
    async number_of_projects_using_site_license(opts) {
      return await number_of_projects_using_site_license(this, opts);
    }

    // async function
    async site_license_public_info(license_id) {
      return await site_license_public_info(this, license_id);
    }

    // async function
    async site_license_manager_set(license_id, info) {
      return await site_license_manager_set(this, license_id, info);
    }

    // async function
    async update_site_license_usage_log() {
      return await update_site_license_usage_log(this);
    }

    // async function
    async matching_site_licenses(search: string, limit: number = 5) {
      return await matching_site_licenses(this, search, limit);
    }

    // async function
    async manager_site_licenses(account_id: string) {
      return await manager_site_licenses(this, account_id);
    }

    // async function
    async project_datastore_set(
      account_id: string,
      project_id: string,
      config: any,
    ) {
      return await project_datastore_set(this, account_id, project_id, config);
    }

    // async function
    async project_datastore_get(account_id: string, project_id: string) {
      return await project_datastore_get(this, account_id, project_id);
    }

    // async function
    async project_datastore_del(
      account_id: string,
      project_id: string,
      name: string,
    ) {
      return await project_datastore_del(this, account_id, project_id, name);
    }

    // async function
    async permanently_unlink_all_deleted_projects_of_user(
      account_id_or_email_address,
    ) {
      return await permanently_unlink_all_deleted_projects_of_user(
        this,
        account_id_or_email_address,
      );
    }

    // async function
    async unlink_old_deleted_projects() {
      return await unlink_old_deleted_projects(this);
    }

    // async function
    async unlist_all_public_paths(account_id, is_owner) {
      return await unlist_all_public_paths(this, account_id, is_owner);
    }

    // async
    async projects_that_need_to_be_started() {
      return await projects_that_need_to_be_started(this);
    }

    // async
    // this *merges* in the run_quota; it doesn't replace it.
    async set_run_quota(project_id, run_quota) {
      return await setRunQuota(this, project_id, run_quota);
    }

    // async -- true if they are a manager on a license or have
    // any subscriptions.
    async is_paying_customer(account_id) {
      return await is_paying_customer(this, account_id);
    }

    // async
    async get_all_public_paths(account_id) {
      return await get_all_public_paths(this, account_id);
    }

    // async
    // Return true if the given account is a member or
    // owner of the given organization.
    async accountIsInOrganization(opts) {
      return await accountIsInOrganization(this, opts);
    }

    // given a name, returns undefined if it is not in use,
    // and the account_id or organization_id that is using it
    // if it is in use.
    async nameToAccountOrOrganization(name) {
      return await nameToAccountOrOrganization(this, name);
    }

    // async
    async registrationTokens(options, query) {
      return await registrationTokens(this, options, query);
    }

    async updateUnreadMessageCount(opts) {
      return await updateUnreadMessageCount(opts);
    }
  };
}
