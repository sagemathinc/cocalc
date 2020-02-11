import { Map } from "immutable";
import { isEqual } from "lodash";
import { PostgreSQL } from "../types";
import { query } from "../query";
import { TypedMap } from "../../../smc-webapp/app-framework";
import { is_valid_uuid_string, len } from "../../smc-util/misc2";
import { callback2 } from "../../smc-util/async-utils";
import { number_of_running_projects_using_license } from "./analytics";

let licenses: any = undefined;

interface License {
  id: string;
  title?: string;
  expires?: Date;
  activates?: Date;
  upgrades?: Map<string, number>;
  run_limit?: number;
}

async function get_valid_licenses(db): Promise<Map<string, TypedMap<License>>> {
  // Todo -- filter on expiration...
  if (licenses == null) {
    licenses = await callback2(db.synctable.bind(db), {
      table: "site_licenses",
      columns: ["title", "expires", "activates", "upgrades", "run_limit"]
      // TODO: Not bothing with the where condition will be fine up to a few thousand (?) site
      // licenses, but after that it could take nontrivial time/memory during hub startup.
      // So... this is a ticking time bomb.
      //, where: { expires: { ">=": new Date() }, activates: { "<=": new Date() } }
    });
  }
  return licenses.get();
}

// Call this any time about to *start* the project.

export async function site_license_hook(
  db: PostgreSQL,
  project_id: string
): Promise<void> {
  const dbg = db._dbg(`site_license_hook("${project_id}")`);
  dbg("site_license_hook -- checking for site license");

  // Check for site licenses, then set the site_license field for this project.

  const project = await query({
    db,
    select: ["site_license"],
    table: "projects",
    where: { project_id },
    one: true
  });
  dbg(`site_license_hook -- project=${JSON.stringify(project)}`);

  if (project.site_license == null || typeof project.site_license != "object") {
    // no site licenses set for this project.
    return;
  }

  const site_license = project.site_license;
  // Next we check the keys of site_license to see what they contribute,
  // and fill that in.
  const licenses = await get_valid_licenses(db);
  let changed: boolean = false;
  for (const license_id in site_license) {
    if (!is_valid_uuid_string(license_id)) {
      // The site_license is supposed to be a map from uuid's to settings...
      // We could put some sort of error here in case, though I don't know what
      // we would do with it.
      continue;
    }
    const license = licenses.get(license_id);
    let is_valid: boolean;
    if (license == null) {
      dbg(`site_license_hook -- License "${license_id}" does not exist.`);
      is_valid = false;
    } else {
      const expires = license.get("expires");
      const activates = license.get("activates");
      const run_limit = license.get("run_limit");
      if (expires != null && expires <= new Date()) {
        dbg(`site_license_hook -- License "${license_id}" expired ${expires}.`);
        is_valid = false;
      } else if (activates == null || activates > new Date()) {
        dbg(
          `site_license_hook -- License "${license_id}" has not been explicitly activated yet ${activates}.`
        );
        is_valid = false;
      } else if (
        run_limit &&
        run_limit <=
          (await number_of_running_projects_using_license(db, license_id))
      ) {
        dbg(
          `site_license_hook -- License "${license_id}" won't be applied since it would exceed the run limit ${run_limit}.`
        );
        is_valid = false;
      } else {
        is_valid = true;
      }
    }

    if (is_valid) {
      if (license == null) throw Error("bug");
      const upgrades = license.get("upgrades");
      if (upgrades != null) {
        const x = upgrades.toJS();
        // remove any zero values to make frontend client code simpler and avoid waste/clutter.
        // NOTE: I do assume these 0 fields are removed in some client code, so don't just not do this!
        for (const field in x) {
          if (!x[field]) {
            delete x[field];
          }
        }
        dbg(
          `site_license_hook -- Found a valid license "${license_id}".  Upgrade using it to ${JSON.stringify(
            x
          )}.`
        );
        if (!isEqual(site_license[license_id], x)) {
          site_license[license_id] = x;
          changed = true;
        }
      } else {
        dbg(
          `site_license_hook -- Found a valid license "${license_id}", but it offers no upgrades.`
        );
      }
    } else {
      dbg(
        `site_license_hook -- Not currently valid license -- "${license_id}".`
      );
      if (!isEqual(site_license[license_id], {})) {
        // Delete any upgrades, so doesn't provide a benefit.
        site_license[license_id] = {};
        changed = true;
      }
    }
  }

  if (changed) {
    // Now set the site license.
    dbg(
      `site_license_hook -- setup site license=${JSON.stringify(site_license)}`
    );
    await query({
      db,
      query: "UPDATE projects",
      where: { project_id },
      jsonb_set: { site_license }
    });
  }
  for (const license_id in site_license) {
    if (len(site_license[license_id]) > 0) {
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
    where: { id: license_id }
  });
}
