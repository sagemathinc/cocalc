import { isEqual } from "lodash";
import { PostgreSQL } from "./types";
const { query } = require("./query");
import { TypedMap } from "smc-webapp/app-framework";
import { is_valid_uuid_string } from "smc-util/misc2";
import { callback2 } from "smc-util/async-utils";

const SITE_LICENSE_UPGRADE = { network: 1, member_host: 1 };

let licenses: any = undefined;

interface License {
  id: string;
  name: string;
}

async function get_valid_licenses(db): Promise<Map<string, TypedMap<License>>> {
  // Todo -- filter on expiration...
  if (licenses == null) {
    licenses = await callback2(db.synctable.bind(db), {
      table: "site_licenses"
    });
  }
  return licenses.get();
}

export async function project_action_request_pre_hook(
  db: PostgreSQL,
  action: string,
  project_id: string,
  dbg: Function
): Promise<void> {
  if (action != "start" && action != "restart") {
    dbg(
      "project_action_request_pre_hook -- only do something on start/restart"
    );
    // We only do something in case of the start or restart action.
    return;
  }
  dbg("project_action_request_pre_hook -- checking for site license");

  // Check for site licenses, then set the site_license field for this project.

  /*
  The only site license rule right now is that *any* project associated to a course with a
  student whose email address contains ucla.edu gets automatically upgraded.  This is
  a temporary one-off site license that will be redone once we have experience with it.
  */

  const project = await query({
    db,
    select: ["site_license"],
    table: "projects",
    where: { project_id },
    one: true
  });
  dbg(`project_action_request_pre_hook -- project=${JSON.stringify(project)}`);

  if (project.site_license == null || typeof project.site_license != "object") {
    // no site licenses set for this course.
    return;
  }

  const site_license = project.site_license;
  // Next we check the keys of site_license to see what they contribute,
  // and fill that in.
  // TODO: impose limits and other rules.
  const licenses = await get_valid_licenses(db);
  let changed: boolean = false;
  for (const license_id in site_license) {
    if (!is_valid_uuid_string(license_id)) {
      // The site_license is supposed to be a map from uuid's to settings...
      // We could put some sort of error here in case, though I don't know what
      // we would do with it.
      continue;
    }
    if (licenses.get(license_id)) {
      // Found a valid license.  Just upgrade it.
      if (!isEqual(site_license[license_id], SITE_LICENSE_UPGRADE)) {
        site_license[license_id] = SITE_LICENSE_UPGRADE;
        changed = true;
      }
    } else {
      // Not currently valid license.
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
      "project_action_request_pre_hook -- setup site license=${JSON.stringify(site_license)}"
    );
    await query({
      db,
      query: "UPDATE projects",
      where: { project_id },
      jsonb_set: { site_license }
    });
  }
}
