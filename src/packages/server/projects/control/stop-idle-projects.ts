/*
The default export is an init function that watches for projects that
are idle too long and stops them.

If you set the environment variable COCALC_NO_IDLE_TIMEOUT, then
this is not used.  It would be better to use the database and a server
setting for this, but an env variable is very fast to implement.
*/

import getLogger from "@cocalc/backend/logger";
import { BaseProject as Project } from "./base";
import getPool from "@cocalc/database/pool";

const logger = getLogger("stop-idle-projects");

// Any project that is started will run at least this long, even if
// last_edited is not touched.  This matters, e.g., when an instructor
// pushes out assignments to their class, or starts all projects in
// their course.  This uses the last_started field in the database.
const MINRUN_S = 10 * 60; // 10 minutes
// exported so it can be used by kucalc's standalone microservice manage-idle as well...
export const QUERY = `
SELECT project_id FROM projects
WHERE state ->> 'state' = 'running'
  AND (run_quota ->> 'always_running' IS NULL OR NOT (run_quota ->> 'always_running')::BOOLEAN)
  AND (last_edited  IS NULL OR (EXTRACT(EPOCH FROM NOW() - last_edited))::FLOAT > (run_quota ->> 'idle_timeout')::BIGINT)
  AND (last_started IS NULL OR (EXTRACT(EPOCH FROM NOW() - last_started))::FLOAT > ${MINRUN_S});
`;
// ::float cast necessary for Postgres 14. See @cocalc/database/pool/util.ts timeInSeconds for more info
// - See https://stackoverflow.com/questions/14020919/find-difference-between-timestamps-in-seconds-in-postgresql
// - There was a massive complicated previous version of the above query that accomplished the same goal.

async function stopIdleProjects(stopProject: (string) => Promise<void>) {
  logger.info("stopping all idle projects");

  logger.debug("query database for all running projects");
  const pool = getPool();
  const { rows } = await pool.query(QUERY);
  //console.log(rows, QUERY.replace(/\n/g, " "));
  logger.debug("got ", rows.length, " running projects that must be stopped");
  const projectsToStop = rows.map(({ project_id }) => project_id);
  const stop = async (project_id) => {
    try {
      await stopProject(project_id);
    } catch (err) {
      logger.debug("WARNING -- nonfatal error stopping ", project_id, err);
    }
  };

  // Stop them all at once, since each individual stop could take a while.
  // If anything goes wrong calling the async function stopProject call logger.debug
  // and display a warning, but do not throw an exception, since we want to run every single
  // stopProject call.
  await Promise.all(projectsToStop.map(stop));
}

export const test = { stopIdleProjects };

export default function init(getProject: (string) => Project) {
  if (process.env.COCALC_NO_IDLE_TIMEOUT) {
    logger.info(
      "NOT initializing idle project stop loop since COCALC_NO_IDLE_TIMEOUT to set",
    );
    return;
  }
  logger.info(
    "initializing idle project stop loop (set environment variable COCALC_NO_IDLE_TIMEOUT to disable)",
  );
  const stopProject = async (project_id: string) => {
    logger.info(`stopping ${project_id} due to idle timeout`);
    try {
      await (await getProject(project_id)).stop({ force: true });
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
