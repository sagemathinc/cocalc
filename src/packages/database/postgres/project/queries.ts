/*
 *  This file is part of CoCalc: Copyright © 2020 – 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import debug from "debug";
import { omit } from "lodash";

import { callback2 } from "@cocalc/util/async-utils";
import {
  DUMMY_SECRET,
  PORT_MAX,
  PORT_MIN,
  validatePortNumber,
} from "@cocalc/util/consts";
import {
  days_ago,
  is_valid_uuid_string,
  map_without_undefined_and_null,
  seconds_ago,
} from "@cocalc/util/misc";
import { DatastoreConfig } from "@cocalc/util/types";
import type { QueryRows } from "@cocalc/util/types/database";

import { query } from "../query";
import { PostgreSQL } from "../types";

const L = debug("hub:project-queries");

export async function project_has_network_access(
  db: PostgreSQL,
  project_id: string,
): Promise<boolean> {
  let x;
  try {
    x = await callback2(db.get_project, {
      project_id,
      columns: ["users", "settings"],
    });
  } catch (err) {
    // error probably means there is no such project or project_id is badly formatted.
    return false;
  }
  if (x.settings != null && x.settings.network) {
    return true;
  }
  if (x.users != null) {
    for (const account_id in x.users) {
      if (
        x.users[account_id] != null &&
        x.users[account_id].upgrades != null &&
        x.users[account_id].upgrades.network
      ) {
        return true;
      }
    }
  }
  return false;
}

// get/set/del datastore configurations in addons

interface GetDSOpts {
  db: PostgreSQL;
  account_id: string;
  project_id: string;
}

async function get_datastore(
  opts: GetDSOpts,
): Promise<{ [key: string]: DatastoreConfig }> {
  const { db, account_id, project_id } = opts;
  const q: { users: any; addons?: any } = await query({
    db,
    table: "projects",
    select: ["addons", "users"],
    where: { project_id },
    one: true,
  });

  // this access test is absolutely critial to have! (only project queries set access_check to false)
  if (q.users[account_id] == null) throw Error(`access denied`);

  return q.addons?.datastore;
}

export async function project_datastore_set(
  db: PostgreSQL,
  account_id: string,
  project_id: string,
  config: any,
): Promise<void> {
  // L("project_datastore_set", config);

  if (config.name == null) throw Error("configuration 'name' is not defined");
  if (typeof config.type !== "string")
    throw Error(
      "configuration 'type' is not defined (must be 'gcs', 'sshfs', ...)",
    );

  // check data from user
  for (const [key, val] of Object.entries(config)) {
    if (val == null) continue;
    if (key === "port") {
      const port = validatePortNumber(val);
      if (port == null) {
        throw new Error(
          `Invalid value -- 'port' must be an integer between ${PORT_MIN} and ${PORT_MAX}`,
        );
      }
      config.port = port;
      continue;
    }
    if (
      typeof val !== "string" &&
      typeof val !== "boolean" &&
      typeof val !== "number"
    ) {
      throw new Error(`Invalid value -- '${key}' is not a valid type`);
    }
    if (typeof val === "string" && val.length > 100000) {
      throw new Error(`Invalid value -- '${key}' is too long`);
    }
  }

  const old_name = config.__old_name;
  const conf_new = omit(config, "name", "secret", "__old_name");

  // this is implicitly a test if the user has access to modify this -- don't catch it
  const ds_prev = await get_datastore({ db, account_id, project_id });

  // there is a situation where datastore is renamed, i.e. "name" is a new one,
  // while the previous secret is stored under a different key. So, if __old_name
  // is set, we pick that one instead.
  const prev_name = old_name != null ? old_name : config.name;

  // if a user wants to update the settings, they don't need to have the secret.
  // an empty value or the dummy text signals to keep the secret as it is...
  if (
    ds_prev != null &&
    ds_prev[prev_name] != null &&
    (config.secret === DUMMY_SECRET || config.secret === "")
  ) {
    conf_new.secret = ds_prev[prev_name].secret;
  } else {
    conf_new.secret = Buffer.from(config.secret ?? "").toString("base64");
  }

  await query({
    db,
    query: "UPDATE projects",
    where: { "project_id = $::UUID": project_id },
    jsonb_merge: { addons: { datastore: { [config.name]: conf_new } } },
  });
}

export async function project_datastore_del(
  db: PostgreSQL,
  account_id: string,
  project_id: string,
  name: string,
): Promise<void> {
  L("project_datastore_del", name);
  if (typeof name !== "string" || name.length == 0) {
    throw Error("Datastore name not properly set.");
  }

  // this is implicitly a test if the user has access to modify this -- don't catch it
  const ds = await get_datastore({ db, account_id, project_id });
  delete ds[name];
  await query({
    db,
    query: "UPDATE projects",
    where: { "project_id = $::UUID": project_id },
    jsonb_set: { addons: { datastore: ds } },
  });
}

export async function project_datastore_get(
  db: PostgreSQL,
  account_id: string,
  project_id: string,
): Promise<any> {
  try {
    const ds = await get_datastore({
      db,
      account_id,
      project_id,
    });
    if (ds != null) {
      for (const [k, v] of Object.entries(ds)) {
        ds[k] = omit(v, "secret") as any;
      }
    }
    return {
      addons: { datastore: ds },
    };
  } catch (err) {
    return { type: "error", error: `${err}` };
  }
}

export interface GetProjectIdsWithUserOptions {
  account_id: string;
  is_owner?: boolean;
}

export async function get_project_ids_with_user(
  db: PostgreSQL,
  opts: GetProjectIdsWithUserOptions,
): Promise<string[]> {
  const where = opts.is_owner
    ? { [`users#>>'{${opts.account_id},group}' = $::TEXT`]: "owner" }
    : { "users ? $::TEXT": opts.account_id };

  const { rows } = await callback2<QueryRows<{ project_id?: string }>>(
    db._query.bind(db),
    {
      query: "SELECT project_id FROM projects",
      where,
    },
  );

  return rows
    .map((row) => row.project_id)
    .filter((value): value is string => typeof value === "string");
}

export interface GetAccountIdsUsingProjectOptions {
  project_id: string;
}

export async function get_account_ids_using_project(
  db: PostgreSQL,
  opts: GetAccountIdsUsingProjectOptions,
): Promise<string[]> {
  const { rows } = await callback2<QueryRows<{ users?: unknown }>>(
    db._query.bind(db),
    {
      query: "SELECT users FROM projects",
      where: { "project_id :: UUID = $": opts.project_id },
    },
  );

  const users = rows[0]?.users;
  if (users == null || typeof users !== "object") {
    return [];
  }

  const account_ids: string[] = [];
  for (const [account_id, info] of Object.entries(
    users as Record<string, { group?: string }>,
  )) {
    const group = info?.group;
    if (typeof group !== "string") {
      continue;
    }
    if (group.indexOf("invite") === -1) {
      account_ids.push(account_id);
    }
  }

  return account_ids;
}

const DEFAULT_PROJECT_COLUMNS = [
  "users",
  "project_id",
  "last_edited",
  "title",
  "description",
  "deleted",
  "created",
  "env",
] as const;

export interface GetProjectOptions {
  project_id: string;
  columns?: string[];
}

export async function get_project(
  db: PostgreSQL,
  opts: GetProjectOptions,
): Promise<Record<string, unknown> | undefined> {
  if (!is_valid_uuid_string(opts.project_id)) {
    throw `invalid project_id -- ${opts.project_id}`;
  }

  const columns = opts.columns ?? DEFAULT_PROJECT_COLUMNS;

  const { rows } = await callback2<QueryRows<Record<string, unknown>>>(
    db._query.bind(db),
    {
      query: `SELECT ${columns.join(",")} FROM projects`,
      where: { "project_id :: UUID = $": opts.project_id },
    },
  );

  if (rows.length === 0) {
    return undefined;
  }
  if (rows.length > 1) {
    throw "more than one result";
  }

  const result = map_without_undefined_and_null(rows[0]);
  return (result ?? undefined) as Record<string, unknown> | undefined;
}

export async function _get_project_column(
  db: PostgreSQL,
  column: string,
  project_id: string,
): Promise<unknown> {
  if (!is_valid_uuid_string(project_id)) {
    throw `invalid project_id -- ${project_id}: getting column ${column}`;
  }

  const { rows } = await callback2<QueryRows<Record<string, unknown>>>(
    db._query.bind(db),
    {
      query: `SELECT ${column} FROM projects`,
      where: { "project_id :: UUID = $": project_id },
    },
  );

  if (rows.length === 0) {
    return undefined;
  }
  if (rows.length > 1) {
    throw "more than one result";
  }

  const value = rows[0]?.[column];
  return value == null ? undefined : value;
}

export async function get_user_column(
  db: PostgreSQL,
  column: string,
  account_id: string,
): Promise<unknown> {
  if (!is_valid_uuid_string(account_id)) {
    throw `invalid account_id -- ${account_id}: getting column ${column}`;
  }

  const { rows } = await callback2<QueryRows<Record<string, unknown>>>(
    db._query.bind(db),
    {
      query: `SELECT ${column} FROM accounts`,
      where: { "account_id :: UUID = $": account_id },
    },
  );

  if (rows.length === 0) {
    return undefined;
  }
  if (rows.length > 1) {
    throw "more than one result";
  }

  const value = rows[0]?.[column];
  return value == null ? undefined : value;
}

export interface RecentlyModifiedProjectsOptions {
  max_age_s: number;
}

export async function recently_modified_projects(
  db: PostgreSQL,
  opts: RecentlyModifiedProjectsOptions,
): Promise<string[]> {
  const { rows } = await callback2<QueryRows<{ project_id?: string }>>(
    db._query.bind(db),
    {
      query: "SELECT project_id FROM projects",
      where: {
        "last_edited >= $::TIMESTAMP": seconds_ago(opts.max_age_s),
      },
    },
  );

  return rows
    .map((row) => row.project_id)
    .filter((value): value is string => typeof value === "string");
}

export interface GetOpenUnusedProjectsOptions {
  min_age_days?: number;
  max_age_days?: number;
  host: string;
}

export async function get_open_unused_projects(
  db: PostgreSQL,
  opts: GetOpenUnusedProjectsOptions,
): Promise<string[]> {
  const min_age_days = opts.min_age_days ?? 30;
  const max_age_days = opts.max_age_days ?? 120;

  const { rows } = await callback2<QueryRows<{ project_id?: string }>>(
    db._query.bind(db),
    {
      query: "SELECT project_id FROM projects",
      where: [
        { "last_edited >= $::TIMESTAMP": days_ago(max_age_days) },
        { "last_edited <= $::TIMESTAMP": days_ago(min_age_days) },
        { "host#>>'{host}' = $::TEXT": opts.host },
        "state#>>'{state}' = 'opened'",
      ],
    },
  );

  return rows
    .map((row) => row.project_id)
    .filter((value): value is string => typeof value === "string");
}

export interface UserIsInProjectGroupOptions {
  account_id?: string;
  project_id: string;
  groups?: string[];
  cache?: boolean;
}

export async function user_is_in_project_group(
  db: PostgreSQL,
  opts: UserIsInProjectGroupOptions,
): Promise<boolean> {
  if (opts.account_id == null) {
    return false;
  }

  const { rows } = await callback2<QueryRows<{ count?: number | string }>>(
    db._query.bind(db),
    {
      query: "SELECT COUNT(*) AS count FROM projects",
      cache: opts.cache ?? false,
      where: {
        "project_id :: UUID = $": opts.project_id,
        [`users#>>'{${opts.account_id},group}' = ANY($)`]: opts.groups ?? [
          "owner",
          "collaborator",
        ],
      },
    },
  );

  const count = parseInt(`${rows[0]?.count ?? 0}`, 10);
  if (count > 0) {
    return true;
  }

  return await callback2(db.is_admin.bind(db), {
    account_id: opts.account_id,
  });
}

export interface UserIsCollaboratorOptions {
  account_id: string;
  project_id: string;
  cache?: boolean;
}

export async function user_is_collaborator(
  db: PostgreSQL,
  opts: UserIsCollaboratorOptions,
): Promise<boolean> {
  const { rows } = await callback2<QueryRows<{ count?: number | string }>>(
    db._query.bind(db),
    {
      query: "SELECT COUNT(*) AS count FROM projects",
      cache: opts.cache ?? true,
      where: ["project_id :: UUID = $1", "users ? $2"],
      params: [opts.project_id, opts.account_id],
    },
  );

  const count = parseInt(`${rows[0]?.count ?? 0}`, 10);
  return count > 0;
}

export interface GetCollaboratorIdsOptions {
  account_id: string;
}

export async function get_collaborator_ids(
  db: PostgreSQL,
  opts: GetCollaboratorIdsOptions,
): Promise<string[]> {
  const { rows } = await callback2<QueryRows<{ jsonb_object_keys?: string }>>(
    db._query.bind(db),
    {
      query: "SELECT DISTINCT jsonb_object_keys(users) FROM projects",
      where: { "users ? $::TEXT": opts.account_id },
    },
  );

  return rows
    .map((row) => row.jsonb_object_keys)
    .filter((value): value is string => typeof value === "string");
}

export interface GetCollaboratorsOptions {
  project_id: string;
}

export async function get_collaborators(
  db: PostgreSQL,
  opts: GetCollaboratorsOptions,
): Promise<string[]> {
  const { rows } = await callback2<QueryRows<{ jsonb_object_keys?: string }>>(
    db._query.bind(db),
    {
      query: "SELECT DISTINCT jsonb_object_keys(users) FROM projects",
      where: { "project_id = $::UUID": opts.project_id },
    },
  );

  return rows
    .map((row) => row.jsonb_object_keys)
    .filter((value): value is string => typeof value === "string");
}
