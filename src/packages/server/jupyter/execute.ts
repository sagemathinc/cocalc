/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import computeHash from "@cocalc/util/jupyter-api/compute-hash";
import getProject from "./global-project-pool";
import callProject from "@cocalc/server/projects/call";
import { jupyter_execute } from "@cocalc/util/message";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import checkForAbuse from "./abuse";
import { expire_time } from "@cocalc/util/relative-time";

const log = getLogger("jupyter-api:execute");

const GLOBAL_LIMITS = {
  timeout_ms: 30000,
  timeout_ms_per_cell: 15000,
  max_output: 2500000,
  max_output_per_cell: 500000,
};

// For now we use a pool size of 4 in our general project(s), with a 6 hour idle timeout.
// This will be configurable via admin settings.  The pool shrinks to 1 after 12 hours.
const GLOBAL_POOL = { size: 4, timeout_s: 6 * 60 * 60 };

const PROJECT_LIMITS = {
  timeout_ms: 45000,
  timeout_ms_per_cell: 30000,
  max_output: 5000000,
  max_output_per_cell: 1000000,
};

// For now, we use a pool size of 2 in user's projects, to avoid using
// much memory, with 30 min idle timeout.  Note that the pool only shrinks
// to 1 after 30 minutes, so it's not so bad.
const PROJECT_POOL = { size: 2, timeout_s: 30 * 60 };

interface Options {
  input?: string; // new input that user types
  kernel?: string;
  history?: string[];
  hash?: string;
  account_id?: string;
  analytics_cookie?: string;
  tag?: string;
  noCache?: boolean;
  project_id?: string;
  path?: string;
}

export async function execute({
  hash,
  input,
  kernel,
  account_id,
  analytics_cookie,
  history,
  tag,
  noCache,
  project_id,
  path,
}: Options): Promise<{
  output: object[];
  created: Date;
} | null> {
  // TODO -- await checkForAbuse({ account_id, analytics_cookie });

  log.debug("execute", {
    input,
    kernel,
    history,
    hash,
    account_id,
    analytics_cookie,
    tag,
    project_id,
    path,
  });

  // If hash is given, we only check if output is in database, and
  // if so return it.  Otherwise, return nothing.
  if (hash != null && !noCache) {
    return await getFromDatabase(hash);
  }
  if (input == null) {
    throw Error("input or hash must not be null");
  }
  if (kernel == null) {
    throw Error("kernel must be specified in hash is not specified");
  }

  const created = new Date();

  hash = computeHash({ history, input, kernel, project_id, path });

  if (!noCache) {
    // Check if we already have this execution history in the database:
    const savedOutput = await getFromDatabase(hash);
    if (savedOutput != null) {
      log.debug("got saved output");
      return savedOutput;
    }
    log.debug("have to compute output");
  }

  // Execute the code.
  let request_account_id, request_project_id, pool, limits;
  if (project_id == null) {
    const { jupyter_api_enabled, jupyter_account_id } =
      await getServerSettings();
    if (!jupyter_api_enabled) {
      throw Error("Jupyter API is not enabled on this server.");
    }

    // we only worry about abuse against the general public pool, not
    // when used in a user's own project
    await checkForAbuse({ account_id, analytics_cookie });

    request_account_id = jupyter_account_id;
    request_project_id = await getProject();

    pool = GLOBAL_POOL;
    limits = GLOBAL_LIMITS;
  } else {
    request_project_id = project_id;
    // both project_id and account_id must be set and account_id must be a collab
    if (account_id == null) {
      throw Error(
        "account_id must be specified -- make sure you are signed in",
      );
    }
    if (!(await isCollaborator({ project_id, account_id }))) {
      throw Error("permission denied -- user must be collaborator on project");
    }
    request_account_id = account_id;
    pool = PROJECT_POOL;
    limits = PROJECT_LIMITS;
  }

  const mesg = jupyter_execute({
    input,
    history,
    kernel,
    path,
    pool,
    limits,
  });
  const resp = await callProject({
    account_id: request_account_id,
    project_id: request_project_id,
    mesg,
  });
  if (resp.error) {
    throw Error(resp.error);
  }
  const { output } = resp;
  // this is HUGE and should not be logged!
  // log.debug("output", output);
  const total_time_s = (Date.now() - created.valueOf()) / 1000;
  saveResponse({
    created,
    input,
    output,
    kernel,
    account_id,
    project_id,
    path,
    analytics_cookie,
    history,
    tag,
    total_time_s,
    hash,
    noCache,
  });
  return { output, created };
}

// We just assume that hash conflicts don't happen for our purposes here.  It's a cryptographic hash function.
async function getFromDatabase(
  hash: string,
): Promise<{ output: object[]; created: Date } | null> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT id, output, created FROM jupyter_api_cache WHERE hash=$1`,
      [hash],
    );
    if (rows.length == 0) {
      return null;
    }
    // cache hit -- we also update last_active (nonblocking, nonfatal)
    (async () => {
      try {
        await pool.query(
          "UPDATE jupyter_api_cache SET last_active=NOW(), expire=NOW() + '1 month'::INTERVAL WHERE id=$1",
          [rows[0].id],
        );
      } catch (err) {
        log.warn("Failed updating cache last_active", err);
      }
    })();
    return rows[0];
  } catch (err) {
    log.warn("Failed to query database cache", err);
    return null;
  }
}

// Save mainly for analytics, metering, and to generally see how (or if)
// people use chatgpt in cocalc.
// Also, we could dedup identical inputs (?).
async function saveResponse({
  created,
  input,
  output,
  kernel,
  account_id,
  project_id,
  path,
  analytics_cookie,
  history,
  tag,
  total_time_s,
  hash,
  noCache,
}) {
  const pool = getPool();
  if (noCache) {
    await pool.query("DELETE FROM jupyter_api_cache WHERE hash=$1", [hash]);
  }
  // expire in one month – for the log, this must be more than "PERIOD" in abuse.ts
  const expire = expire_time(30 * 24 * 60 * 60);
  try {
    await Promise.all([
      pool.query(
        `INSERT INTO jupyter_api_log(created,account_id,project_id,path,analytics_cookie,tag,hash,total_time_s,kernel,history,input,expire) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          created,
          account_id,
          project_id,
          path,
          analytics_cookie,
          tag,
          hash,
          total_time_s,
          kernel,
          history,
          input,
          expire,
        ],
      ),
      pool.query(
        `INSERT INTO jupyter_api_cache(created,hash,output,last_active,expire) VALUES($1,$2,$3,$4,$5)`,
        [created, hash, output, created, expire],
      ),
    ]);
  } catch (err) {
    log.warn("Failed to save Jupyter execute log entry to database:", err);
  }
}
