/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Project control class.

The hub uses this to get information about a project and do some basic tasks.
There are different implementations for different ways in which cocalc
gets deployed.

This module does 3 things:

1. CONTROL: Start/stop/restart a project.
2. CONNECT: Get ports, ip address, and the project secret token
3. COPY:    Copying a directory of files from one project to another.

For simplicity, it doesn't do anything else. It's good to keep this as small as
possible, so it is manageable, especially as we adapt CoCalc to new
environments.
*/

import { callback2, until } from "@cocalc/util/async-utils";
import { db } from "@cocalc/database";
import { EventEmitter } from "events";
import { isEqual } from "lodash";
import { ProjectState, ProjectStatus } from "@cocalc/util/db-schema/projects";
import { Quota, quota } from "@cocalc/util/upgrades/quota";
import getLogger from "@cocalc/backend/logger";
import { getQuotaSiteSettings } from "@cocalc/database/postgres/quota-site-settings";
import getPool from "@cocalc/database/pool";
import { query } from "@cocalc/database/postgres/query";
import { getProjectSecretToken } from "./secret-token";
import { client as projectRunnerClient } from "@cocalc/conat/project/runner/run";
import { conat } from "@cocalc/backend/conat";
import {
  startProjectOnHost,
  stopProjectOnHost,
} from "@cocalc/server/project-host/control";
import {
  getMembershipProjectDefaultsFromUsers,
  mergeProjectSettingsWithMembership,
} from "@cocalc/server/membership/project-defaults";
export type { ProjectState, ProjectStatus };

const logger = getLogger("project-control");

export type Action = "open" | "start" | "stop" | "restart";

// We use a cache to ensure that there is at most one copy of a given Project
// for each project_id, since internally we assume this in some cases, e.g.,
// when starting a project we rely on the internal stateChanging attribute
// rather than the database to know that we're starting the project.  We use
// WeakRef so that when nothing is referencing the project, it can be garbage
// collected.  These objects don't use much memory, but blocking garbage collection
// would be bad.
const projectCache: { [project_id: string]: WeakRef<BaseProject> } = {};
export function getProject(project_id: string): BaseProject {
  let project = projectCache[project_id]?.deref();
  if (project == null) {
    project = new BaseProject(project_id);
    projectCache[project_id] = new WeakRef(project);
  }
  return project!;
}

export class BaseProject extends EventEmitter {
  public readonly project_id: string;
  public is_ready: boolean = false;
  public is_freed: boolean = false;
  protected stateChanging: ProjectState | undefined = undefined;

  constructor(project_id: string) {
    super();
    projectCache[project_id] = new WeakRef(this);
    this.project_id = project_id;
    const dbg = this.dbg("constructor");
    dbg("initializing");
  }

  async touch(
    account_id?: string,
    { noStart }: { noStart?: boolean } = {},
  ): Promise<void> {
    const d = db();
    if (account_id) {
      await callback2(d.touch.bind(d), {
        project_id: this.project_id,
        account_id,
      });
    } else {
      const pool = getPool();
      await pool.query(
        "UPDATE projects SET last_edited=NOW() WHERE project_id=$1",
        [this.project_id],
      );
    }
    if (!noStart) {
      await this.start();
    }
  }


  async saveStateToDatabase(state: ProjectState): Promise<void> {
    await callback2(db().set_project_state, {
      ...state,
      project_id: this.project_id,
    });
  }

  protected async saveStatusToDatabase(status: ProjectStatus): Promise<void> {
    await callback2(db().set_project_status, {
      project_id: this.project_id,
      status,
    });
  }

  dbg(f: string): (string?) => void {
    return (msg?: string) => {
      logger.debug(`(project_id=${this.project_id}).${f}: ${msg}`);
    };
  }

  private projectRunner = () => {
    return projectRunnerClient({
      project_id: this.project_id,
      client: conat(),
    });
  };

  // Get the state of the project -- state is just whether or not
  // it is runnig, stopping, starting.  It's not much info.
  state = async (): Promise<ProjectState> => {
    // rename everywhere to status?  state is a field, and status
    // is the whole object
    const runner = this.projectRunner();
    return await runner.status({ project_id: this.project_id });
  };

  status = async (): Promise<ProjectStatus> => {
    // deprecated?
    return {} as ProjectStatus;
  };

  start = async (): Promise<void> => {
    await this.computeQuota();
    await startProjectOnHost(this.project_id);
  };

  save = async (): Promise<void> => {
    // no-op
  };

  stop = async ({ force }: { force?: boolean } = {}): Promise<void> => {
    if (force) {
      logger.debug("stop -- TODO -- force not implemented");
    }
    await stopProjectOnHost(this.project_id);
  };

  restart = async (): Promise<void> => {
    this.dbg("restart")();
    await this.stop();
    await this.start();
  };

  wait = async (opts: {
    until: () => Promise<boolean>;
    maxTime: number;
  }): Promise<void> => {
    await until(
      async () => {
        if (await opts.until()) {
          logger.debug(`wait ${this.project_id} -- satisfied`);
          return true;
        }
        return false;
      },
      {
        start: 250,
        decay: 1.25,
        max: opts.maxTime,
        log: (...args) => logger.debug("wait", this.project_id, ...args),
      },
    );
  };

  // Everything the hub needs to know to connect to the project
  // via the TCP connection.  Raises error if anything can't be
  // determined.
  address = async (): Promise<{
    host: string;
    port: number;
    secret_token: string;
  }> => {
    const dbg = this.dbg("address");
    dbg("first ensure is running");
    await this.start();
    dbg("it is running");
    const status = await this.status();
    if (!status["hub-server.port"]) {
      throw Error("unable to determine project port");
    }
    const state = await this.state();
    const host = state.ip;
    if (!host) {
      throw Error("unable to determine host");
    }
    return {
      host,
      port: status["hub-server.port"],
      secret_token: await getProjectSecretToken(this.project_id),
    };
  };

  /*
    set_all_quotas ensures that if the project is running and the quotas
    (except idle_timeout) have changed, then the project is restarted.
    */
  setAllQuotas = async (): Promise<void> => {
    const dbg = this.dbg("set_all_quotas");
    dbg();
    // 1. Get data about project from the database, namely:
    //     - is project currently running (if not, nothing to do)
    //     - if running, what quotas it was started with and what its quotas are now
    // 2. If quotas differ *AND* project is running, restarts project.
    // There is also a fix for https://github.com/sagemathinc/cocalc/issues/5633
    // in here, because we get the site_settings as well.
    const x = await callback2(db().get_project, {
      project_id: this.project_id,
      columns: ["state", "users", "settings", "run_quota"],
    });
    if (!["running", "starting", "pending"].includes(x.state?.state)) {
      dbg("project not active so nothing to do");
      return;
    }
    const site_settings = await getQuotaSiteSettings(); // this is quick, usually cached
    const cur = quota(x.settings, undefined, site_settings);
    if (isEqual(x.run_quota, cur)) {
      dbg("running, but no quotas changed");
      return;
    } else {
      dbg("running and a quota changed; restart");
      // CRITICAL: do NOT await on this restart!  The set_all_quotas call must
      // complete quickly (in an HTTP request), whereas restart can easily take 20s,
      // and there is no reason to wait on this.  Wrapping this as below calls the
      // function, properly awaits and logs what happens, and avoids uncaught exceptions,
      // but doesn't block the caller of this function.
      (async () => {
        try {
          await this.restart();
          dbg("restart worked");
        } catch (err) {
          dbg(`restart failed -- ${err}`);
        }
      })();
    }
  };

  computeQuota = async () => {
    await this.setRunQuota(null);
  };

  // The run_quota is now explicitly used in singule-user and multi-user
  // to control at least idle timeout of projects; also it is very useful
  // for development since it is shown in the UI (in project settings).
  setRunQuota = async (run_quota: Quota | null): Promise<void> => {
    // if null we have to compute it based on membership and settings
    // TODO: change this to only use the membership of the user starting the project, not all users.
    // E.g., any user A can add any pro user B and magically get upgrades, even though B isn't involved!
    if (run_quota == null) {
      const { settings, users } = await query({
        db: db(),
        select: ["settings", "users"],
        table: "projects",
        where: { project_id: this.project_id },
        one: true,
      });

      const membershipDefaults =
        await getMembershipProjectDefaultsFromUsers(users);
      const settingsWithMembership = mergeProjectSettingsWithMembership(
        settings,
        membershipDefaults,
      );
      const site_settings = await getQuotaSiteSettings(); // quick, usually cached
      run_quota = quota(settingsWithMembership, undefined, site_settings);
    }

    await query({
      db: db(),
      query: "UPDATE projects",
      where: { project_id: this.project_id },
      set: { run_quota },
    });

    logger.debug("updated run_quota=", JSON.stringify(run_quota));
  };
}
