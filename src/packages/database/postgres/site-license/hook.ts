/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { isEqual } from "lodash";
import { PostgreSQL } from "../types";
import { query } from "../query";
import { TypedMap } from "@cocalc/util/types/typed-map";
import { is_valid_uuid_string, len } from "@cocalc/util/misc";
import { callback2 } from "@cocalc/util/async-utils";
import { number_of_running_projects_using_license } from "./analytics";
import { Quota } from "@cocalc/util/db-schema/site-licenses";
type QuotaMap = TypedMap<Quota>;
import {
  quota as compute_total_quota,
  SiteLicenseQuotaSetting,
  QuotaSetting,
  SiteLicenses,
} from "@cocalc/util/upgrades/quota";

// this will hold a synctable for all valid licenses
let LICENSES: any = undefined;

interface License {
  id: string;
  title?: string;
  expires?: Date;
  activates?: Date;
  upgrades?: Map<string, number>;
  quota?: QuotaMap;
  run_limit?: number;
}

type LicenseMap = TypedMap<License>;

// used to throttle lase_used updates per license
const LAST_USED: { [licensed_id: string]: number } = {};

/*
Call this any time about to *start* the project.

Check for site licenses, then set the site_license field for this project.
The *value* for each key records what the license provides and whether or
not it is actually being used by the project.

If the license provides nothing new compared to what is already provided
by already applied **licenses** and upgrades, then the license is *not*
applied.

related issues about it's heuristic:
- https://github.com/sagemathinc/cocalc/issues/4979 -- do not apply a license if it does not provide upgrades
- https://github.com/sagemathinc/cocalc/pull/5490 -- remove a license if it is expired
- https://github.com/sagemathinc/cocalc/issues/5635 -- do not completely remove a license if it is still valid
*/

export async function site_license_hook(
  db: PostgreSQL,
  project_id: string
): Promise<void> {
  try {
    const slh = new SiteLicenseHook(db, project_id);
    await slh.process();
  } catch (err) {
    db._dbg("site_license_hook")(`ERROR -- ${err}`);
    throw err;
  }
}

class SiteLicenseHook {
  private db: PostgreSQL;
  private project_id: string;
  private dbg: Function;

  constructor(db: PostgreSQL, project_id: string) {
    this.db = db;
    this.project_id = project_id;
    this.dbg = db._dbg(`siteLicenseHook("${project_id}")`);
  }

  private async getValidLicenses(): Promise<Map<string, LicenseMap>> {
    // Todo -- filter on expiration...
    if (LICENSES == null) {
      LICENSES = await callback2(this.db.synctable.bind(this.db), {
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
    return LICENSES.get();
  }

  async process() {
    this.dbg("checking for site license");

    const project = await query({
      db: this.db,
      select: ["site_license", "settings", "users"],
      table: "projects",
      where: { project_id: this.project_id },
      one: true,
    });
    this.dbg(`project=${JSON.stringify(project)}`);

    if (
      project.site_license == null ||
      typeof project.site_license != "object"
    ) {
      this.dbg("no site licenses set for this project.");
      return;
    }

    // just to make sure we don't touch it:
    project.site_license = Object.freeze(project.site_license);
    const new_site_license = this.getNewSiteLicense(project);

    if (!isEqual(project.site_license, new_site_license)) {
      // Now set the site license since something changed.
      this.dbg(`setup site license=${JSON.stringify(new_site_license)}`);
      await query({
        db: this.db,
        query: "UPDATE projects",
        where: { project_id: this.project_id },
        jsonb_set: { site_license: new_site_license },
      });
    } else {
      this.dbg("no change");
    }
    for (const license_id in new_site_license) {
      if (len(new_site_license[license_id]) > 0) {
        await this.update_last_used(license_id);
      }
    }
  }

  private async getNewSiteLicense(project): Promise<SiteLicenses> {
    const site_license = project.site_license;
    // Next we check the keys of site_license to see what they contribute,
    // and fill that in.
    const newLicense: SiteLicenses = {};
    for (const license_id in site_license) {
      if (!is_valid_uuid_string(license_id)) {
        // The site_license is supposed to be a map from uuid's to settings...
        // We could put some sort of error here in case, though I don't know what
        // we would do with it.
        this.dbg(`skipping invalid license ${license_id}`);
        continue;
      }
      const licenses = await this.getValidLicenses();
      const license = licenses.get(license_id);
      const state = await this.checkLicense({ license, license_id });

      if (state === "is_valid") {
        const upgrades: QuotaSetting = this.extractUpgrades(license);

        this.dbg("computing run quotas...");
        const run_quota = compute_total_quota(
          project.settings,
          project.users,
          newLicense
        );
        const run_quota_with_license = compute_total_quota(
          project.settings,
          project.users,
          {
            ...newLicense,
            ...{ [license_id]: upgrades },
          }
        );
        this.dbg(`run_quota=${JSON.stringify(run_quota)}`);
        this.dbg(
          `run_quota_with_license=${JSON.stringify(run_quota_with_license)}`
        );
        if (!isEqual(run_quota, run_quota_with_license)) {
          this.dbg(
            `Found a valid license "${license_id}".  Upgrade using it to ${JSON.stringify(
              upgrades
            )}.`
          );
          newLicense[license_id] = upgrades;
        } else {
          this.dbg(
            `Found a valid license "${license_id}", but it provides nothing new so not using it.`
          );
        }
      } else {
        this.dbg(`Not currently valid license -- "${license_id}".`);
        // due to how jsonb_set works, we have to set this to null,
        // because otherwise an existing license entry continues to exist.
        newLicense[license_id] = null;
      }
    }
    return newLicense;
  }

  private extractUpgrades(license): QuotaSetting {
    if (license == null) throw new Error("bug");
    // Licenses can specify what they do in two distinct ways: upgrades and quota.
    const upgrades = (license.get("upgrades")?.toJS() ?? {}) as QuotaSetting;
    if (upgrades == null) {
      // This is to make typescript happy since QuotaSetting may be null
      // (though I don't think upgrades ever could be).
      throw Error("bug");
    }
    const quota = license.get("quota");
    if (quota) {
      upgrades["quota"] = quota.toJS() as SiteLicenseQuotaSetting;
    }
    // remove any zero values to make frontend client code simpler and avoid waste/clutter.
    // NOTE: I do assume these 0 fields are removed in some client code, so don't just not do this!
    for (const field in upgrades) {
      if (!upgrades[field]) {
        delete upgrades[field];
      }
    }
    return upgrades;
  }

  private async checkLicense({
    license,
    license_id,
  }): Promise<"expired" | "exhausted" | "is_valid" | "future"> {
    this.dbg(
      `considering license ${license_id}: ${JSON.stringify(license?.toJS())}`
    );
    if (license == null) {
      this.dbg(`License "${license_id}" does not exist.`);
      return "expired";
    } else {
      const expires = license.get("expires");
      const activates = license.get("activates");
      const run_limit = license.get("run_limit");
      if (expires != null && expires <= new Date()) {
        this.dbg(`License "${license_id}" expired ${expires}.`);
        return "expired";
      } else if (activates == null || activates > new Date()) {
        this.dbg(
          `License "${license_id}" has not been explicitly activated yet ${activates}.`
        );
        return "future";
      } else if (run_limit && this.aboveRunLimit(run_limit, license_id)) {
        this.dbg(
          `License "${license_id}" won't be applied since it would exceed the run limit ${run_limit}.`
        );
        return "exhausted";
      } else {
        this.dbg(`license ${license_id} is valid`);
        return "is_valid";
      }
    }
  }

  private async aboveRunLimit(run_limit, license_id): Promise<boolean> {
    return (
      (await number_of_running_projects_using_license(this.db, license_id)) >=
      run_limit
    );
  }

  private async update_last_used(license_id: string): Promise<void> {
    this.dbg(`update_last_used("${license_id}")`);
    const now = new Date().valueOf();
    if (
      LAST_USED[license_id] != null &&
      now - LAST_USED[license_id] <= 60 * 1000
    ) {
      this.dbg("recently updated so waiting");
      // If we updated this entry in the database already within a minute, don't again.
      return;
    }
    LAST_USED[license_id] = now;
    this.dbg("did NOT recently update, so updating in database");

    await callback2(this.db._query.bind(this.db), {
      query: "UPDATE site_licenses",
      set: { last_used: "NOW()" },
      where: { id: license_id },
    });
  }
}
