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

export async function project_datastore_set(
  db: PostgreSQL,
  account_id: string,
  project_id: string,
  config: any
): Promise<void> {
  // config = {"name":"f","user":"f","host":"f","path":"w","secret":"asdf\n\nasdf","readonly":false}

  L("project_datastore_set", config);

  if (config.name == null) throw Error("configuration 'name' is not defined");
  if (typeof config.type !== "string")
    throw Error(
      "configuration 'type' is not defined (must be 'gcs', 'sshfs', ...)"
    );

  const q: { users: any } = await query({
    db,
    table: "projects",
    select: ["users"],
    where: { project_id },
    one: true,
  });

  // TODO is this test necessary? given this comes from db-schema/projects.ts ?
  if (q.users[account_id] == null) throw Error(`access denied`);

  const ds = omit(config, "name", "secret");
  ds.secret = Buffer.from(config.secret ?? "").toString("base64");

  await query({
    db,
    query: "UPDATE projects",
    where: { "project_id = $::UUID": project_id },
    jsonb_merge: { addons: { datastore: { [config.name]: ds } } },
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

  const q: { users: any; addons: any } = await query({
    db,
    table: "projects",
    select: ["addons", "users"],
    where: { project_id },
    one: true,
  });

  // TODO is this test necessary? given this comes from db-schema/projects.ts ?
  if (q.users[account_id] == null) throw Error(`access denied`);

  const ds = q.addons.datastore;
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
  project_id: string
): Promise<any> {
  try {
    const q: { users: any; addons: any } = await query({
      db,
      table: "projects",
      select: ["addons", "users"],
      where: { project_id },
      one: true,
    });
    // TODO is this test necessary? given this comes from db-schema/projects.ts ?
    if (q.users[account_id] == null) throw Error(`access denied`);
    const ds = {};
    if (q.addons.datastore != null) {
      for (const [k, v] of Object.entries(q.addons.datastore)) {
        ds[k] = omit(v, "secret");
      }
    }
    return {
      addons: { datastore: ds },
    };
  } catch (err) {
    return { type: "error", error: err };
  }
}
