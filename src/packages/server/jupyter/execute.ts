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

const log = getLogger("jupyter:execute");

const EXPIRE = "3 months";

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
  sha1?: string;
  account_id?: string;
  analytics_cookie?: string;
  tag?: string;
  noCache?: boolean;
}

export async function execute({
  sha1,
  input,
  kernel,
  account_id,
  analytics_cookie,
  history,
  tag,
  noCache,
}: Options): Promise<object[] | null> {
  // TODO -- await checkForAbuse({ account_id, analytics_cookie });

  log.debug("execute", {
    input,
    kernel,
    history,
    sha1,
    account_id,
    analytics_cookie,
    tag,
  });

  // If sha1 is given, we only check if output is in database, and
  // if so return it.  Otherwise, return nothing.
  if (sha1 != null) {
    return await getFromDatabase(sha1);
  }
  if (input == null) {
    throw Error("input or sha1 must not be null");
  }
  if (kernel == null) {
    throw Error("kernel must be specified in sha1 is not specified");
  }

  // normalize by trimming, which we assume doesn't change eval significantly.
  input = input.trim();
  history = history?.map((x) => x.trim());
  const start = Date.now();

  const { jupyter_account_id, jupyter_api_enabled } = await getConfig();
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

  const hash = computeHash({ history, input, kernel });

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
  const { project_id } = await getOneProject(jupyter_account_id);
  const mesg = jupyter_execute({ input, history, kernel });
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
  const total_time_s = (Date.now() - start) / 1000;
  saveResponse({
    input,
    output,
    kernel,
    account_id,
    analytics_cookie,
    history,
    tag,
    total_time_s,
    hash,
  });
  return output;
}

// We just assume that sha1 hash conflicts don't happen for our
// purposes here.
async function getFromDatabase(hash: string): Promise<null | object[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT id, output FROM jupyter_execute_log WHERE hash=$1`,
      [hash]
    );
    const output = rows[0]?.output ?? null;
    if (output != null) {
      // update the expire timestamp, thus extending the life of this active row.
      // but don't block on this.
      updateExpire(pool, rows[0]?.id);
    }
    return output;
  } catch (err) {
    log.warn("Failed to query database cache", err);
    return null;
  }
}

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

// Save mainly for analytics, metering, and to generally see how (or if)
// people use chatgpt in cocalc.
// Also, we could dedup identical inputs (?).
async function saveResponse({
  input,
  output,
  kernel,
  account_id,
  analytics_cookie,
  history,
  tag,
  total_time_s,
  hash,
}) {
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO jupyter_execute_log(time,expire,input,output,kernel,account_id,analytics_cookie,history,tag,hash,total_time_s) VALUES(NOW(),NOW()+INTERVAL '${EXPIRE}',$1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        input,
        output,
        kernel,
        account_id,
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
