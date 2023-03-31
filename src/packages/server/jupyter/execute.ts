/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { pii_retention_to_future } from "@cocalc/database/postgres/pii";
import { delay } from "awaiting";

const log = getLogger("jupyter:execute");

async function getConfig(): Promise<{
  enabled: boolean;
  expire: Date | undefined;
}> {
  log.debug("get config");
  const { jupyterApiEnabled, pii_retention } = await getServerSettings();

  return {
    jupyterApiEnabled,
    expire: pii_retention_to_future(pii_retention),
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
  histroy,
  account_id,
  analytics_cookie,
  history,
  tag,
}: ChatOptions): Promise<string> {
  log.debug("execute", {
    input,
    kernel,
    histroy,
    account_id,
    analytics_cookie,
    history,
    tag,
  });
  const start = Date.now();
  // TODO -- await checkForAbuse({ account_id, analytics_cookie });
  const { jupyterApiEnabled, expire } = await getConfig();
  if (false && !jupyterApiEnabled) {
    // todo
    throw Error("Jupyter API is not enabled on this server.");
  }

  const output = { stdout: eval(input) };
  const total_time_s = (Date.now() - start) / 1000;
  saveResponse({
    input,
    output,
    kernel,
    account_id,
    analytics_cookie,
    history,
    tag,
    expire: account_id == null ? expire : undefined,
  });

  // NOTE about expire -- see ../openai/chatgpt.ts.
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
  expire,
}) {
  const pool = getPool();
  try {
    await pool.query(
      "INSERT INTO jupyter_execute_log(input,output,kernel,account_id,analytics_cookie,history,tag,expire) VALUES(NOW(),$1,$2,$3,$4,$5,$6,$7,$8)",
      [
        input,
        output,
        kernel,
        account_id,
        analytics_cookie,
        history,
        tag,
        expire,
      ]
    );
  } catch (err) {
    log.warn("Failed to save Jupyter execute log entry to database:", err);
  }
}
