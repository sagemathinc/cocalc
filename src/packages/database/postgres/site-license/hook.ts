/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { isEqual, sortBy } from "lodash";
import { PostgreSQL } from "../types";
import { query } from "../query";
import { TypedMap } from "@cocalc/util/types/typed-map";
import { is_valid_uuid_string, len } from "@cocalc/util/misc";
import { callback2 } from "@cocalc/util/async-utils";
import { number_of_running_projects_using_license } from "./analytics";
import { SiteLicenseQuota } from "@cocalc/util/types/site-licenses";

type QuotaMap = TypedMap<SiteLicenseQuota>;
import {
  quota as compute_total_quota,
  SiteLicenseQuotaSetting,
  QuotaSetting,
  SiteLicenses,
  LicenseStatus,
  siteLicenseSelectionKeys,
  licenseToGroupKey,
  isSiteLicenseQuotaSetting,
} from "@cocalc/util/upgrades/quota";

import getLogger from "@cocalc/backend/logger";
const LOGGER_NAME = "site-license-hook";

const ORDERING_GROUP_KEYS = Array.from(siteLicenseSelectionKeys());

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
const LAST_USED: { [license_id: string]: number } = {};

/**
 * Call this any time about to *start* the project.
 *
 * Check for site licenses, then set the site_license field for this project.
 * The *value* for each key records what the license provides and whether or
 * not it is actually being used by the project.
 *
 * If the license provides nothing new compared to what is already provided
 * by already applied **licenses** and upgrades, then the license is *not*
 * applied.
 *
 * related issues about it's heuristic:
 * - https://github.com/sagemathinc/cocalc/issues/4979 -- do not apply a license if it does not provide upgrades
 * - https://github.com/sagemathinc/cocalc/pull/5490 -- remove a license if it is expired
 * - https://github.com/sagemathinc/cocalc/issues/5635 -- do not completely remove a license if it is still valid
 */
export async function site_license_hook(
  db: PostgreSQL,
  project_id: string
): Promise<void> {
  try {
    const slh = new SiteLicenseHook(db, project_id);
    await slh.process();
  } catch (err) {
    const L = getLogger(LOGGER_NAME);
    L.warn(`ERROR -- ${err}`);
    throw err;
  }
}
/**
 * This encapulates the logic for applying site licenses to projects.
 * Use the convenience function site_license_hook() to call this.
 */
class SiteLicenseHook {
  private db: PostgreSQL;
  private project_id: string;
  private dbg: ReturnType<typeof getLogger>;
  private projectSiteLicenses: SiteLicenses = {};
  private nextSiteLicense: SiteLicenses = {};
  private project: { site_license: any; settings: any; users: any };

  constructor(db: PostgreSQL, project_id: string) {
    this.db = db;
    this.project_id = project_id;
    this.dbg = getLogger(`${LOGGER_NAME}:${project_id}`);
  }

  /**
   * returns the cached synctable holding all licenses
   *
   * TODO: filter on expiration...
   */
  private async getAllValidLicenses(): Promise<Map<string, LicenseMap>> {
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

  /**
   * Basically, if the combined license config for this project changes, set it for the project.
   */
  async process() {
    this.dbg.verbose("checking for site licenses");
    this.project = await this.getProject();

    if (
      this.project.site_license == null ||
      typeof this.project.site_license != "object"
    ) {
      this.dbg.verbose("no site licenses set for this project.");
      return;
    }

    // just to make sure we don't touch it
    this.projectSiteLicenses = Object.freeze(this.project.site_license);
    this.nextSiteLicense = await this.computeNextSiteLicense();
    await this.setProjectSiteLicense();
    await this.updateLastUsed();
  }

  private async getProject() {
    const project = await query({
      db: this.db,
      select: ["site_license", "settings", "users"],
      table: "projects",
      where: { project_id: this.project_id },
      one: true,
    });
    this.dbg.verbose(`project=${JSON.stringify(project)}`);
    return project;
  }

  /**
   * If there is a change in licensing, set it for the project.
   */
  private async setProjectSiteLicense() {
    const dbg = this.dbg.extend("setProjectSiteLicense");
    if (!isEqual(this.projectSiteLicenses, this.nextSiteLicense)) {
      // Now set the site license since something changed.
      dbg.info(
        `setup a modified site license=${JSON.stringify(this.nextSiteLicense)}`
      );
      await query({
        db: this.db,
        query: "UPDATE projects",
        where: { project_id: this.project_id },
        jsonb_set: { site_license: this.nextSiteLicense },
      });
    } else {
      dbg.info("no change");
    }
  }

  /**
   * We have to order the site licenses by their priority.
   * Otherwise, the method of applying them one-by-one does lead to issues, because if a lower priority
   * license is considered first (and applied), and then a higher priority license is considered next,
   * the quota algorithm will only pick the higher priority license in the second iteration, causing the
   * effective quotas to be different, and hence actually both licenses seem to be applied but they are not.
   *
   * additionally (march 2022): start with regular licenses, then boost licenses
   */
  private orderedSiteLicenseIDs(validLicenses): string[] {
    const ids = Object.keys(this.projectSiteLicenses).filter((id) => {
      return validLicenses.get(id) != null;
    });

    const orderedIds: string[] = [];

    // first all regular licenses (boost == false), then the boost licenses
    for (const boost of [false, true]) {
      const idsPartition = ids.filter((id) => {
        const val = validLicenses.get(id).toJS();
        // one group is every license, while the other are those where quota.boost is true
        const isBoost =
          isSiteLicenseQuotaSetting(val) && (val.quota.boost ?? false);
        return isBoost === boost;
      });
      orderedIds.push(
        ...sortBy(idsPartition, (id) => {
          const val = validLicenses.get(id).toJS();
          const key = licenseToGroupKey(val);
          return ORDERING_GROUP_KEYS.indexOf(key);
        })
      );
    }

    return orderedIds;
  }

  /**
   * Calculates the next site license situation, replacing whatever the project is currently licensed as.
   * A particular site license will only be used if it actually causes the upgrades to increase.
   */
  private async computeNextSiteLicense(): Promise<SiteLicenses> {
    // Next we check the keys of site_license to see what they contribute,
    // and fill that in.
    const nextLicense: SiteLicenses = {};
    const allValidLicenses = await this.getAllValidLicenses();

    // it's important to start testing with regular licenses by decreasing priority
    for (const license_id of this.orderedSiteLicenseIDs(allValidLicenses)) {
      if (!is_valid_uuid_string(license_id)) {
        // The site_license is supposed to be a map from uuid's to settings...
        // We could put some sort of error here in case, though I don't know what
        // we would do with it.
        this.dbg.info(`skipping invalid license ${license_id} -- invalid UUID`);
        continue;
      }
      const license = allValidLicenses.get(license_id);
      const status = await this.checkLicense({ license, license_id });

      if (status === "valid") {
        const upgrades: QuotaSetting = this.extractUpgrades(license);

        this.dbg.verbose(`computing run quotas by adding ${license_id}...`);
        const run_quota = compute_total_quota(
          this.project.settings,
          this.project.users,
          nextLicense
        );
        const run_quota_with_license = compute_total_quota(
          this.project.settings,
          this.project.users,
          {
            ...nextLicense,
            ...{ [license_id]: upgrades },
          }
        );
        this.dbg.silly(`run_quota=${JSON.stringify(run_quota)}`);
        this.dbg.silly(
          `run_quota_with_license=${JSON.stringify(run_quota_with_license)}`
        );
        if (!isEqual(run_quota, run_quota_with_license)) {
          this.dbg.info(
            `License "${license_id}" provides an effective upgrade ${JSON.stringify(
              upgrades
            )}.`
          );
          nextLicense[license_id] = { ...upgrades, status: "active" };
        } else {
          this.dbg.info(
            `Found a valid license "${license_id}", but it provides nothing new so not using it.`
          );
          nextLicense[license_id] = { status: "ineffective" };
        }
      } else {
        // license is not valid, all other cases:
        // Note: in an earlier version we did delete an expired license. We don't do this any more,
        // but instead record that it is expired and tell the user about it.
        this.dbg.info(`Disabling license "${license_id}" -- status=${status}`);
        nextLicense[license_id] = { status }; // no upgrades or quotas!
      }
    }
    return nextLicense;
  }

  /**
   * get the upgrade provided by a given license
   */
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

  /**
   * A license can be in in one of these four states:
   * - valid: the license is valid and provides upgrades
   * - expired: the license is expired and should be removed
   * - disabled: the license is disabled and should not provide any upgrades
   * - future: the license is valid but not yet and should not provide any upgrades as well
   */
  private async checkLicense({ license, license_id }): Promise<LicenseStatus> {
    this.dbg.info(
      `considering license ${license_id}: ${JSON.stringify(license?.toJS())}`
    );
    if (license == null) {
      this.dbg.info(`License "${license_id}" does not exist.`);
      return "expired";
    } else {
      const expires = license.get("expires");
      const activates = license.get("activates");
      const run_limit = license.get("run_limit");
      if (expires != null && expires <= new Date()) {
        this.dbg.info(`License "${license_id}" expired ${expires}.`);
        return "expired";
      } else if (activates == null || activates > new Date()) {
        this.dbg.info(
          `License "${license_id}" has not been explicitly activated yet ${activates}.`
        );
        return "future";
      } else if (await this.aboveRunLimit(run_limit, license_id)) {
        this.dbg.info(
          `License "${license_id}" won't be applied since it would exceed the run limit ${run_limit}.`
        );
        return "exhausted";
      } else {
        this.dbg.info(`license ${license_id} is valid`);
        return "valid";
      }
    }
  }

  /**
   * Returns true, if using that license would exceed the run limit.
   */
  private async aboveRunLimit(run_limit, license_id): Promise<boolean> {
    if (typeof run_limit !== "number") return false;
    const usage = await number_of_running_projects_using_license(
      this.db,
      license_id
    );
    this.dbg.verbose(`run_limit=${run_limit}  usage=${usage}`);
    return usage >= run_limit;
  }

  /**
   * Check for each license involved if the "last_used" field should be updated
   */
  private async updateLastUsed() {
    for (const license_id in this.nextSiteLicense) {
      // this checks if the given license is actually not deactivated
      if (len(this.nextSiteLicense[license_id]) > 0) {
        await this._updateLastUsed(license_id);
      }
    }
  }

  private async _updateLastUsed(license_id: string): Promise<void> {
    const dbg = this.dbg.extend(`_updateLastUsed("${license_id}")`);
    const now = Date.now();
    if (
      LAST_USED[license_id] != null &&
      now - LAST_USED[license_id] <= 60 * 1000
    ) {
      dbg.info("recently updated so waiting");
      // If we updated this entry in the database already within a minute, don't again.
      return;
    }
    LAST_USED[license_id] = now;
    dbg.info("did NOT recently update, so updating in database");
    await callback2(this.db._query.bind(this.db), {
      query: "UPDATE site_licenses",
      set: { last_used: "NOW()" },
      where: { id: license_id },
    });
  }
}
