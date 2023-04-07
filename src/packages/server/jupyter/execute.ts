/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import computeHash from "@cocalc/util/jupyter-api/compute-hash";
import getOneProject from "@cocalc/server/projects/get-one";
import callProject from "@cocalc/server/projects/call";
import { jupyter_execute } from "@cocalc/util/message";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

const log = getLogger("jupyter:execute");

//const EXPIRE = "3 months";

async function getConfig() {
  log.debug("get config");
  const { jupyter_account_id, jupyter_api_enabled } = await getServerSettings();

  return {
    jupyter_account_id,
    jupyter_api_enabled,
  };
}

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
  time: Date;
  total_time_s: number;
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
  if (hash != null) {
    return await getFromDatabase(hash);
  }
  if (input == null) {
    throw Error("input or hash must not be null");
  }
  if (kernel == null) {
    throw Error("kernel must be specified in hash is not specified");
  }

  const time = new Date;

  let { jupyter_account_id, jupyter_api_enabled } = await getConfig();
  if (!jupyter_api_enabled) {
    throw Error("Jupyter API is not enabled on this server.");
  }
  if (!jupyter_account_id) {
    throw Error(
      "Jupyter API must be configured with an account_id that owns the compute project pool."
    );
  }

  if (!isValidUUID(jupyter_account_id)) {
    throw Error("Jupyter API account_id is not a valid uuid.");
  }

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
  if (project_id == null) {
    project_id = (await getOneProject(jupyter_account_id)).project_id;
  } else {
    // both project_id and account_id must be set and account_id must be a collab
    if (account_id == null) {
      throw Error("account_id must be specified");
    }
    if (!isCollaborator({ project_id, account_id })) {
      throw Error("permission denied -- user must be collaborator on project");
    }
    jupyter_account_id = account_id;
  }

  const mesg = jupyter_execute({ input, history, kernel, path });
  const resp = await callProject({
    account_id: jupyter_account_id,
    project_id,
    mesg,
  });
  if (resp.error) {
    throw Error(resp.error);
  }
  const { output } = resp;
  log.debug("output", output);
  const total_time_s = (Date.now() - time.valueOf()) / 1000;
  saveResponse({
    time,
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
  return { output, time, total_time_s };
}

// We just assume that hash conflicts don't happen for our purposes here.  It's a cryptographic hash function.
async function getFromDatabase(
  hash: string
): Promise<{ output: object[]; time: Date; total_time_s: number } | null> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT output, time, total_time_s FROM jupyter_execute_log WHERE hash=$1`,
      [hash]
    );
    if (rows.length == 0) {
      return null;
    }
    return rows[0];
  } catch (err) {
    log.warn("Failed to query database cache", err);
    return null;
  }
}

/*
async function updateExpire(pool, id: number) {
  try {
    await pool.query(
      `UPDATE jupyter_execute_log SET expire=NOW()+INTERVAL '${EXPIRE}' WHERE id=$1`,
      [id]
    );
  } catch (err) {
    log.warn("error updating expire ", id, err);
  }
}
*/

// Save mainly for analytics, metering, and to generally see how (or if)
// people use chatgpt in cocalc.
// Also, we could dedup identical inputs (?).
async function saveResponse({
  time,
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
    await pool.query("DELETE FROM jupyter_execute_log WHERE hash=$1", [hash]);
  }
  try {
    await pool.query(
      `INSERT INTO jupyter_execute_log(time,input,output,kernel,account_id,project_id,path,analytics_cookie,history,tag,hash,total_time_s) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        time,
        input,
        output,
        kernel,
        account_id,
        project_id,
        path,
        analytics_cookie,
        history,
        tag,
        hash,
        total_time_s,
      ]
    );
  } catch (err) {
    log.warn("Failed to save Jupyter execute log entry to database:", err);
  }
}
