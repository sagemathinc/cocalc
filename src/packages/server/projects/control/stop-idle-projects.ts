/*
The default export is an init function that watches for projects that
are idle too long and stops them.

If you set the environment variable COCALC_NO_IDLE_TIMEOUT, then
this is not used.  It would be better to use the database and a server
setting for this, but an env variable is very fast to implement.
*/

import getLogger from "@cocalc/backend/logger";
import { callback2 } from "@cocalc/util/async-utils";
import { db } from "@cocalc/database";
import { DEFAULT_QUOTAS } from "@cocalc/util/upgrade-spec";
import { BaseProject as Project } from "./base";

const logger = getLogger("stop-idle-projects");

async function stopIdleProjects(stopProject: (string) => Promise<void>) {
  logger.info("stopping all idle projects");

  logger.debug("query database for all running projects");
  const runningProjects = (
    await callback2(db()._query, {
      // ::float necessary for Postgres 14, see @cocalc/database/pool/util.ts timeInSeconds for more info
      query: `SELECT project_id, (EXTRACT(EPOCH FROM NOW() - last_edited))::FLOAT as idle_time, settings, run_quota
         FROM projects
         WHERE state ->> 'state' = 'running'`,
    })
  ).rows;
  logger.debug("got ", runningProjects);
  for (const project of runningProjects) {
    const { project_id, idle_time, settings, run_quota } = project;
    // take the run_quota or the admin setting into account (if nothing, then the default)
    // and in any case, at lesat 10 mintues
    const mintime = Math.max(
      10 * 60,
      run_quota?.idle_timeout ?? settings?.mintime ?? DEFAULT_QUOTAS.mintime
    );
    const always_running = settings?.always_running ?? false;
    if (!always_running && idle_time > mintime) {
      // stopProject is async, but we don't await it (and it doesn't raise),
      // since we want to immediately stop all of them, rather than waiting
      // and stopping based on outdated information.
      stopProject(project_id);
    }
  }
}

export default function init(getProject: (string) => Project) {
  if (process.env.COCALC_NO_IDLE_TIMEOUT) {
    logger.info(
      "NOT initializing idle project stop loop since COCALC_NO_IDLE_TIMEOUT to set"
    );
    return;
  }
  logger.info(
    "initializing idle project stop loop (set environment variable COCALC_NO_IDLE_TIMEOUT to disable)"
  );
  const stopProject = async (project_id: string) => {
    logger.info(`stopping ${project_id} due to idle timeout`);
    try {
      (await getProject(project_id)).stop();
      logger.debug(`stopped ${project_id} successfully`);
    } catch (err) {
      logger.error(`error stopping ${project_id} -- ${err}`);
    }
  };
  setInterval(() => {
    stopIdleProjects(stopProject);
  }, 60000);
  stopIdleProjects(stopProject);
}
