/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { isEqual } from "lodash";
import { PostgreSQL } from "../types";
import { query } from "../query";
import { TypedMap } from "../../../smc-webapp/app-framework";
import { is_valid_uuid_string, len } from "../../smc-util/misc";
import { callback2 } from "../../smc-util/async-utils";
import { number_of_running_projects_using_license } from "./analytics";
import { QuotaMap } from "../../smc-util/db-schema/site-licenses";
import { quota as compute_total_quota } from "../../smc-util/upgrades/quota";

let licenses: any = undefined;

interface License {
  id: string;
  title?: string;
  expires?: Date;
  activates?: Date;
  upgrades?: Map<string, number>;
  quota?: QuotaMap;
  run_limit?: number;
}

async function get_valid_licenses(db): Promise<Map<string, TypedMap<License>>> {
  // Todo -- filter on expiration...
  if (licenses == null) {
    licenses = await callback2(db.synctable.bind(db), {
      table: "site_licenses",
      columns: [
        "title",
        "expires",
        "activates",
        "upgrades",
        "quota",
        "run_limit",
      ],
      // TODO: Not bothing with the where condition will be fine up to a few thousand (?) site
      // licenses, but after that it could take nontrivial time/memory during hub startup.
      // So... this is a ticking time bomb.
      //, where: { expires: { ">=": new Date() }, activates: { "<=": new Date() } }
    });
  }
  return licenses.get();
}

/*
Call this any time about to *start* the project.

Check for site licenses, then set the site_license field for this project.
The *value* for each key records what the license provides and whether or
not it is actually being used by the project.

If the license provides nothing new compared to what is already provided
by already applied **licenses** and upgrades, then the license is *not*
applied.   See
      https://github.com/sagemathinc/cocalc/issues/4979
*/

export async function site_license_hook(
  db: PostgreSQL,
  project_id: string
): Promise<void> {
  try {
    await site_license_hook0(db, project_id);
  } catch (err) {
    db._dbg("site_license_hook")(`ERROR -- ${err}`);
    throw err;
  }
}

async function site_license_hook0(
  db: PostgreSQL,
  project_id: string
): Promise<void> {
  const dbg = db._dbg(`site_license_hook("${project_id}")`);
  dbg("site_license_hook -- checking for site license");

  const project = await query({
    db,
    select: ["site_license", "settings", "users"],
    table: "projects",
    where: { project_id },
    one: true,
  });
  dbg(`project=${JSON.stringify(project)}`);

  if (project.site_license == null || typeof project.site_license != "object") {
    dbg("no site licenses set for this project.");
    return;
  }

  const site_license = project.site_license;
  const new_site_license: { [license_id: string]: object } = {};
  // Next we check the keys of site_license to see what they contribute,
  // and fill that in.
  const licenses = await get_valid_licenses(db);
  for (const license_id in site_license) {
    if (!is_valid_uuid_string(license_id)) {
      // The site_license is supposed to be a map from uuid's to settings...
      // We could put some sort of error here in case, though I don't know what
      // we would do with it.
      dbg(`skipping invalid license ${license_id}`);
      continue;
    }
    const license = licenses.get(license_id);
    dbg(
      `considering license ${license_id}: ${JSON.stringify(license?.toJS())}`
    );
    let is_valid: boolean;
    if (license == null) {
      dbg(`License "${license_id}" does not exist.`);
      is_valid = false;
    } else {
      const expires = license.get("expires");
      const activates = license.get("activates");
      const run_limit = license.get("run_limit");
      if (expires != null && expires <= new Date()) {
        dbg(`License "${license_id}" expired ${expires}.`);
        is_valid = false;
      } else if (activates == null || activates > new Date()) {
        dbg(
          `License "${license_id}" has not been explicitly activated yet ${activates}.`
        );
        is_valid = false;
      } else if (
        run_limit &&
        (await number_of_running_projects_using_license(db, license_id)) >=
          run_limit
      ) {
        dbg(
          `License "${license_id}" won't be applied since it would exceed the run limit ${run_limit}.`
        );
        is_valid = false;
      } else {
        dbg(`license ${license_id} is valid`);
        is_valid = true;
      }
    }

    if (is_valid) {
      if (license == null) throw Error("bug");
      // Licenses can specify what they do in two distinct ways: upgrades and quota.
      const upgrades: object = license.get("upgrades")?.toJS() ?? {};
      const quota = license.get("quota")?.toJS();
      if (quota) {
        upgrades["quota"] = quota;
      }
      // remove any zero values to make frontend client code simpler and avoid waste/clutter.
      // NOTE: I do assume these 0 fields are removed in some client code, so don't just not do this!
      for (const field in upgrades) {
        if (!upgrades[field]) {
          delete upgrades[field];
        }
      }

      dbg("computing run quotas...");
      const run_quota = compute_total_quota(
        project.settings,
        project.users,
        new_site_license
      );
      const run_quota_with_license = compute_total_quota(
        project.settings,
        project.users,
        {
          ...new_site_license,
          ...{ [license_id]: upgrades },
        }
      );
      dbg(`run_quota=${JSON.stringify(run_quota)}`);
      dbg(`run_quota_with_license=${JSON.stringify(run_quota_with_license)}`);
      if (!isEqual(run_quota, run_quota_with_license)) {
        dbg(
          `Found a valid license "${license_id}".  Upgrade using it to ${JSON.stringify(
            upgrades
          )}.`
        );
        new_site_license[license_id] = upgrades;
      } else {
        dbg(
          `Found a valid license "${license_id}", but it provides nothing new so not using it.`
        );
      }
    } else {
      dbg(`Not currently valid license -- "${license_id}".`);
    }
  }

  if (!isEqual(site_license, new_site_license)) {
    // Now set the site license since something changed.
    dbg(`setup site license=${JSON.stringify(new_site_license)}`);
    await query({
      db,
      query: "UPDATE projects",
      where: { project_id },
      jsonb_set: { site_license: new_site_license },
    });
  } else {
    dbg("no change");
  }
  for (const license_id in new_site_license) {
    if (len(new_site_license[license_id]) > 0) {
      await update_last_used(db, license_id, dbg);
    }
  }
}

const last_used: { [licensed_id: string]: number } = {};
async function update_last_used(
  db: PostgreSQL,
  license_id: string,
  dbg: Function
): Promise<void> {
  dbg(`update_last_used("${license_id}")`);
  const now = new Date().valueOf();
  if (
    last_used[license_id] != null &&
    now - last_used[license_id] <= 60 * 1000
  ) {
    dbg("recently updated so waiting");
    // If we updated this entry in the database already within a minute, don't again.
    return;
  }
  last_used[license_id] = now;
  dbg("did NOT recently update, so updating in database");

  await callback2(db._query.bind(db), {
    query: "UPDATE site_licenses",
    set: { last_used: "NOW()" },
    where: { id: license_id },
  });
}
