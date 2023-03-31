/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { sha1 } from "@cocalc/util/misc";
import getOneProject from "@cocalc/server/projects/get-one";
import callProject from "@cocalc/server/projects/call";
import { jupyter_execute } from "@cocalc/util/message";

const log = getLogger("jupyter:execute");

const EXPIRE = "1 month";

async function getConfig() {
  log.debug("get config");
  const { jupyter_account_id, jupyter_api_enabled } = await getServerSettings();

  return {
    jupyter_account_id,
    jupyter_api_enabled,
  };
}

interface Options {
  input: string; // new input that user types
  kernel: string;
  history?: string[];
  account_id?: string;
  analytics_cookie?: string;
  tag?: string;
}

export async function execute({
  input,
  kernel,
  account_id,
  analytics_cookie,
  history,
  tag,
}: Options): Promise<object[]> {
  log.debug("execute", {
    input,
    kernel,
    history,
    account_id,
    analytics_cookie,
    tag,
  });
  const start = Date.now();
  // TODO -- await checkForAbuse({ account_id, analytics_cookie });
  const { jupyter_account_id, jupyter_api_enabled } = await getConfig();
  if (!jupyter_api_enabled) {
    throw Error("Jupyter API is not enabled on this server.");
  }

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
  });
  return output;
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
        hash((history ?? []).concat([input])),
        total_time_s,
      ]
    );
  } catch (err) {
    log.warn("Failed to save Jupyter execute log entry to database:", err);
  }
}

function hash(history: string[]): string {
  return sha1(JSON.stringify(history));
}
