/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is meant to run on a multi-user system, but where the hub
runs as a single user and all projects also run as that same
user, but with there own HOME directories.  There is thus no
security or isolation at all between projects.  There is still
a notion of multiple cocalc projects and cocalc users.

This is useful for:
  - development of cocalc from inside of a CoCalc project
  - non-collaborative use of cocalc on your own
    laptop, e.g., when you're on an airplane.
*/

import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import createPurchase from "@cocalc/server/purchases/create-purchase";

import { kill } from "process";

import {
  copyPath,
  ensureConfFilesExists,
  getEnvironment,
  getProjectPID,
  getState,
  getStatus,
  homePath,
  isProjectRunning,
  launchProjectDaemon,
  mkdir,
  setupDataPath,
} from "./util";
import {
  BaseProject,
  CopyOptions,
  ProjectStatus,
  ProjectState,
  getProject,
} from "./base";
import getLogger from "@cocalc/backend/logger";
import { query } from "@cocalc/database/postgres/query";
import { db } from "@cocalc/database";
import { quota } from "@cocalc/util/upgrades/quota";
import { getQuotaSiteSettings } from "@cocalc/database/postgres/site-license/quota-site-settings";

const logger = getLogger("project-control:single-user");

// Usually should fully start in about 5 seconds, but we give it 20s.
const MAX_START_TIME_MS = 20000;
const MAX_STOP_TIME_MS = 10000;

const PAY_AS_YOU_GO_THRESH_MS = 60 * 1000;

class Project extends BaseProject {
  private HOME: string;

  constructor(project_id: string) {
    super(project_id);
    this.HOME = homePath(this.project_id);
  }

  async state(): Promise<ProjectState> {
    if (this.stateChanging != null) {
      return this.stateChanging;
    }
    const state = await getState(this.HOME);
    this.saveStateToDatabase(state);
    return state;
  }

  async status(): Promise<ProjectStatus> {
    const status = await getStatus(this.HOME);
    // TODO: don't include secret token in log message.
    logger.debug(
      `got status of ${this.project_id} = ${JSON.stringify(status)}`
    );
    await this.saveStatusToDatabase(status);
    return status;
  }

  async start(): Promise<void> {
    logger.debug("start", this.project_id);
    if (this.stateChanging != null) return;

    // Home directory
    const HOME = this.HOME;

    if (await isProjectRunning(HOME)) {
      logger.debug("start -- already running");
      await this.saveStateToDatabase({ state: "running" });
      return;
    }

    try {
      this.stateChanging = { state: "starting" };
      await this.saveStateToDatabase(this.stateChanging);
      await this.siteLicenseHook();
      await this.setRunQuota();

      await mkdir(HOME, { recursive: true });

      await ensureConfFilesExists(HOME);

      // this.get('env') = extra env vars for project (from synctable):
      const env = await getEnvironment(this.project_id);
      logger.debug(`start ${this.project_id}: env = ${JSON.stringify(env)}`);

      // Setup files
      await setupDataPath(HOME);

      // Fork and launch project server
      await launchProjectDaemon(env);

      await this.wait({
        until: async () => {
          if (!(await isProjectRunning(this.HOME))) {
            return false;
          }
          const status = await this.status();
          return !!status.secret_token && !!status["hub-server.port"];
        },
        maxTime: MAX_START_TIME_MS,
      });
    } finally {
      this.stateChanging = undefined;
      // ensure state valid in database
      await this.state();
    }
  }

  async stop(): Promise<void> {
    if (this.stateChanging != null) return;
    logger.debug("stop ", this.project_id);
    if (!(await isProjectRunning(this.HOME))) {
      await this.saveStateToDatabase({ state: "opened" });
      return;
    }
    try {
      this.stateChanging = { state: "stopping" };
      await this.saveStateToDatabase(this.stateChanging);
      try {
        const pid = await getProjectPID(this.HOME);
        kill(-pid);
      } catch (_err) {
        // expected exception if no pid
      }
      await this.wait({
        until: async () => !(await isProjectRunning(this.HOME)),
        maxTime: MAX_STOP_TIME_MS,
      });
    } finally {
      this.stateChanging = undefined;
      // ensure state valid.
      await this.state();
    }
  }

  async copyPath(opts: CopyOptions): Promise<string> {
    logger.debug("copyPath ", this.project_id, opts);
    await copyPath(opts, this.project_id);
    return "";
  }

  // despite not being used, this is useful for development and
  // the run_quota is shown in the UI (in project settings).
  async setRunQuota(): Promise<void> {
    const { settings, users, site_license, pay_as_you_go_quotas } = await query(
      {
        db: db(),
        select: ["site_license", "settings", "users", "pay_as_you_go_quotas"],
        table: "projects",
        where: { project_id: this.project_id },
        one: true,
      }
    );

    const site_settings = await getQuotaSiteSettings(); // quick, usually cached

    let run_quota = quota(settings, users, site_license, site_settings);

    if (pay_as_you_go_quotas != null) {
      let choice: null | { quota: any; account_id: string } = null;
      const now = Date.now();
      for (const account_id in pay_as_you_go_quotas) {
        const quota = pay_as_you_go_quotas[account_id];
        if (Math.abs(quota.enabled - now) <= PAY_AS_YOU_GO_THRESH_MS) {
          if (choice == null) {
            choice = { quota, account_id };
          } else if (
            Math.abs(quota.enabled - now) < Math.abs(choice.quota.enabled - now)
          ) {
            choice.quota = quota;
            choice.account_id = account_id;
          }
        }
      }
      if (choice != null && choice.account_id && choice.quota.cost) {
        // Can the user actually create this purchase for at least 1 hour?
        // If so, we do it.  Note: this already got checked on the frontend
        // so this should only fail on the backend in rare cases (e.g., abuse),
        // so no need to have an error message the user sees here.
        const { allowed } = await isPurchaseAllowed({
          account_id: choice.account_id,
          service: "project-upgrade",
          cost: choice.quota.cost,
        });
        if (allowed) {
          const run_quota0 = run_quota;
          run_quota = quota(settings, {}, {}, site_settings, choice);
          // create the purchase.  As explained in setProjectQuota, we can
          // trust choice.quota.cost.
          try {
            await createPurchase({
              account_id: choice.account_id,
              project_id: this.project_id,
              service: "project-upgrade",
              description: {
                type: "project-upgrade",
                start: Date.now(),
                project_id: this.project_id,
                upgrade: choice.quota,
              },
            });
          } catch (err) {
            // failed -- maybe could happen despite check above (?), but should
            // be VERY rare
            // We reset the run quota.
            run_quota = run_quota0;
            logger.error(`Problem creating purchase`, err);
          }
        }
      }
    }

    await query({
      db: db(),
      query: "UPDATE projects",
      where: { project_id: this.project_id },
      set: { run_quota },
    });

    logger.debug("updated run_quota=", run_quota);
  }
}

export default function get(project_id: string): Project {
  return (getProject(project_id) as Project) ?? new Project(project_id);
}
