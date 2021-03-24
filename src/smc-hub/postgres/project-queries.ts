/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { omit } from "lodash";
import { PostgreSQL } from "./types";
import { callback2 } from "../smc-util/async-utils";
import { query } from "./query";
import * as debug from "debug";
const L = debug("hub:project-queries");
import { DUMMY_SECRET } from "../../smc-webapp/project/settings/const";
import { DatastoreConfig } from "../../smc-webapp/project/settings/types";

export async function project_has_network_access(
  db: PostgreSQL,
  project_id: string
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
  access_check?: boolean;
}

async function get_datastore(
  opts: GetDSOpts
): Promise<{ [key: string]: DatastoreConfig }> {
  const { db, account_id, project_id, access_check = true } = opts;
  const q: { users: any; addons?: any } = await query({
    db,
    table: "projects",
    select: ["addons", "users"],
    where: { project_id },
    one: true,
  });

  // this access test is absolutely critial to have! (only project queries set access_check to false)
  if (access_check) {
    if (q.users[account_id] == null) throw Error(`access denied`);
  }

  return q.addons?.datastore;
}

export async function project_datastore_set(
  db: PostgreSQL,
  account_id: string,
  project_id: string,
  config: any
): Promise<void> {
  // L("project_datastore_set", config);

  if (config.name == null) throw Error("configuration 'name' is not defined");
  if (typeof config.type !== "string")
    throw Error(
      "configuration 'type' is not defined (must be 'gcs', 'sshfs', ...)"
    );

  // check data from user
  for (const [key, val] of Object.entries(config)) {
    if (typeof val !== "string" && typeof val !== "boolean") {
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
  name: string
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
  access_check: boolean
): Promise<any> {
  try {
    const ds = await get_datastore({
      db,
      account_id,
      project_id,
      access_check,
    });
    if (ds != null) {
      for (const [k, v] of Object.entries(ds)) {
        ds[k] = omit(v, "secret");
      }
    }
    return {
      addons: { datastore: ds },
    };
  } catch (err) {
    return { type: "error", error: `${err}` };
  }
}
