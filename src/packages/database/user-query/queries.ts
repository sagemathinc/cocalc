/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { PostgreSQL } from "../postgres";

import * as userQuery from "./methods-impl";

type PostgreSQLConstructor = new (...args: any[]) => PostgreSQL;

export function extend_PostgreSQL<TBase extends PostgreSQLConstructor>(
  ext: TBase,
): TBase {
  return class PostgreSQL extends ext {
    cancel_user_queries(
      ...args: Parameters<typeof userQuery.cancel_user_queries>
    ) {
      return userQuery.cancel_user_queries.call(this, ...args);
    }

    user_query(...args: Parameters<typeof userQuery.user_query>) {
      return userQuery.user_query.call(this, ...args);
    }

    _user_query(...args: Parameters<typeof userQuery._user_query>) {
      return userQuery._user_query.call(this, ...args);
    }

    _inc_changefeed_count(
      ...args: Parameters<typeof userQuery._inc_changefeed_count>
    ) {
      return userQuery._inc_changefeed_count.call(this, ...args);
    }

    _dec_changefeed_count(
      ...args: Parameters<typeof userQuery._dec_changefeed_count>
    ) {
      return userQuery._dec_changefeed_count.call(this, ...args);
    }

    _user_query_array(...args: Parameters<typeof userQuery._user_query_array>) {
      return userQuery._user_query_array.call(this, ...args);
    }

    user_query_cancel_changefeed(
      ...args: Parameters<typeof userQuery.user_query_cancel_changefeed>
    ) {
      return userQuery.user_query_cancel_changefeed.call(this, ...args);
    }

    _user_get_query_columns(
      ...args: Parameters<typeof userQuery._user_get_query_columns>
    ) {
      return userQuery._user_get_query_columns.call(this, ...args);
    }

    _require_is_admin(...args: Parameters<typeof userQuery._require_is_admin>) {
      return userQuery._require_is_admin.call(this, ...args);
    }

    _require_project_ids_in_groups(
      ...args: Parameters<typeof userQuery._require_project_ids_in_groups>
    ) {
      return userQuery._require_project_ids_in_groups.call(this, ...args);
    }

    _query_parse_options(
      ...args: Parameters<typeof userQuery._query_parse_options>
    ) {
      return userQuery._query_parse_options.call(this, ...args);
    }

    _parse_set_query_opts(
      ...args: Parameters<typeof userQuery._parse_set_query_opts>
    ) {
      return userQuery._parse_set_query_opts.call(this, ...args);
    }

    _user_set_query_enforce_requirements(
      ...args: Parameters<typeof userQuery._user_set_query_enforce_requirements>
    ) {
      return userQuery._user_set_query_enforce_requirements.call(this, ...args);
    }

    _user_set_query_where(
      ...args: Parameters<typeof userQuery._user_set_query_where>
    ) {
      return userQuery._user_set_query_where.call(this, ...args);
    }

    _user_set_query_values(
      ...args: Parameters<typeof userQuery._user_set_query_values>
    ) {
      return userQuery._user_set_query_values.call(this, ...args);
    }

    _user_set_query_hooks_prepare(
      ...args: Parameters<typeof userQuery._user_set_query_hooks_prepare>
    ) {
      return userQuery._user_set_query_hooks_prepare.call(this, ...args);
    }

    _user_query_set_count(
      ...args: Parameters<typeof userQuery._user_query_set_count>
    ) {
      return userQuery._user_query_set_count.call(this, ...args);
    }

    _user_query_set_delete(
      ...args: Parameters<typeof userQuery._user_query_set_delete>
    ) {
      return userQuery._user_query_set_delete.call(this, ...args);
    }

    _user_set_query_conflict(
      ...args: Parameters<typeof userQuery._user_set_query_conflict>
    ) {
      return userQuery._user_set_query_conflict.call(this, ...args);
    }

    _user_query_set_upsert(
      ...args: Parameters<typeof userQuery._user_query_set_upsert>
    ) {
      return userQuery._user_query_set_upsert.call(this, ...args);
    }

    _user_query_set_upsert_and_jsonb_merge(
      ...args: Parameters<
        typeof userQuery._user_query_set_upsert_and_jsonb_merge
      >
    ) {
      return userQuery._user_query_set_upsert_and_jsonb_merge.call(
        this,
        ...args,
      );
    }

    _user_set_query_main_query(
      ...args: Parameters<typeof userQuery._user_set_query_main_query>
    ) {
      return userQuery._user_set_query_main_query.call(this, ...args);
    }

    user_set_query(...args: Parameters<typeof userQuery.user_set_query>) {
      return userQuery.user_set_query.call(this, ...args);
    }

    _mod_fields(...args: Parameters<typeof userQuery._mod_fields>) {
      return userQuery._mod_fields.call(this, ...args);
    }

    _user_get_query_json_timestamps(
      ...args: Parameters<typeof userQuery._user_get_query_json_timestamps>
    ) {
      return userQuery._user_get_query_json_timestamps.call(this, ...args);
    }

    _user_get_query_set_defaults(
      ...args: Parameters<typeof userQuery._user_get_query_set_defaults>
    ) {
      return userQuery._user_get_query_set_defaults.call(this, ...args);
    }

    _user_set_query_project_users(
      ...args: Parameters<typeof userQuery._user_set_query_project_users>
    ) {
      return userQuery._user_set_query_project_users.call(this, ...args);
    }

    _user_set_query_project_manage_users_owner_only(
      ...args: Parameters<
        typeof userQuery._user_set_query_project_manage_users_owner_only
      >
    ) {
      return userQuery._user_set_query_project_manage_users_owner_only.call(
        this,
        ...args,
      );
    }

    project_action(...args: Parameters<typeof userQuery.project_action>) {
      return userQuery.project_action.call(this, ...args);
    }

    _user_set_query_project_change_before(
      ...args: Parameters<
        typeof userQuery._user_set_query_project_change_before
      >
    ) {
      return userQuery._user_set_query_project_change_before.call(
        this,
        ...args,
      );
    }

    _user_set_query_project_change_after(
      ...args: Parameters<typeof userQuery._user_set_query_project_change_after>
    ) {
      return userQuery._user_set_query_project_change_after.call(this, ...args);
    }

    _user_get_query_functional_subs(
      ...args: Parameters<typeof userQuery._user_get_query_functional_subs>
    ) {
      return userQuery._user_get_query_functional_subs.call(this, ...args);
    }

    _parse_get_query_opts(
      ...args: Parameters<typeof userQuery._parse_get_query_opts>
    ) {
      return userQuery._parse_get_query_opts.call(this, ...args);
    }

    _json_fields(...args: Parameters<typeof userQuery._json_fields>) {
      return userQuery._json_fields.call(this, ...args);
    }

    _user_get_query_where(
      ...args: Parameters<typeof userQuery._user_get_query_where>
    ) {
      return userQuery._user_get_query_where.call(this, ...args);
    }

    _user_get_query_options(
      ...args: Parameters<typeof userQuery._user_get_query_options>
    ) {
      return userQuery._user_get_query_options.call(this, ...args);
    }

    _user_get_query_do_query(
      ...args: Parameters<typeof userQuery._user_get_query_do_query>
    ) {
      return userQuery._user_get_query_do_query.call(this, ...args);
    }

    _user_get_query_query(
      ...args: Parameters<typeof userQuery._user_get_query_query>
    ) {
      return userQuery._user_get_query_query.call(this, ...args);
    }

    _user_get_query_satisfied_by_obj(
      ...args: Parameters<typeof userQuery._user_get_query_satisfied_by_obj>
    ) {
      return userQuery._user_get_query_satisfied_by_obj.call(this, ...args);
    }

    _user_get_query_handle_field_deletes(
      ...args: Parameters<typeof userQuery._user_get_query_handle_field_deletes>
    ) {
      return userQuery._user_get_query_handle_field_deletes.call(this, ...args);
    }

    _user_get_query_changefeed(
      ...args: Parameters<typeof userQuery._user_get_query_changefeed>
    ) {
      return userQuery._user_get_query_changefeed.call(this, ...args);
    }

    user_get_query(...args: Parameters<typeof userQuery.user_get_query>) {
      return userQuery.user_get_query.call(this, ...args);
    }

    _user_set_query_syncstring_change_after(
      ...args: Parameters<
        typeof userQuery._user_set_query_syncstring_change_after
      >
    ) {
      return userQuery._user_set_query_syncstring_change_after.call(
        this,
        ...args,
      );
    }

    _user_set_query_patches_check(
      ...args: Parameters<typeof userQuery._user_set_query_patches_check>
    ) {
      return userQuery._user_set_query_patches_check.call(this, ...args);
    }

    _user_get_query_patches_check(
      ...args: Parameters<typeof userQuery._user_get_query_patches_check>
    ) {
      return userQuery._user_get_query_patches_check.call(this, ...args);
    }

    _user_set_query_cursors_check(
      ...args: Parameters<typeof userQuery._user_set_query_cursors_check>
    ) {
      return userQuery._user_set_query_cursors_check.call(this, ...args);
    }

    _user_get_query_cursors_check(
      ...args: Parameters<typeof userQuery._user_get_query_cursors_check>
    ) {
      return userQuery._user_get_query_cursors_check.call(this, ...args);
    }

    _syncstring_access_check(
      ...args: Parameters<typeof userQuery._syncstring_access_check>
    ) {
      return userQuery._syncstring_access_check.call(this, ...args);
    }

    _syncstrings_check(
      ...args: Parameters<typeof userQuery._syncstrings_check>
    ) {
      return userQuery._syncstrings_check.call(this, ...args);
    }

    updateRetentionData(
      ...args: Parameters<typeof userQuery.updateRetentionData>
    ) {
      return userQuery.updateRetentionData.call(this, ...args);
    }
  };
}
