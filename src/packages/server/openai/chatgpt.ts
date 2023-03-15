/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
// fetch polyfill -- see https://github.com/transitive-bullshit/chatgpt-api/issues/376
import "isomorphic-fetch";

// See https://github.com/transitive-bullshit/chatgpt-api/issues/367
const importDynamic = new Function("modulePath", "return import(modulePath)");

const log = getLogger("chatgpt");

async function getApiKey(): Promise<string> {
  log.debug("get API key");
  const pool = getPool("medium");
  const { rows } = await pool.query(
    "SELECT value FROM server_settings WHERE name='openai_api_key'"
  );
  if (rows.length == 0 || !rows[0].value) {
    log.debug("NO API key");
    throw Error("You must provide an OpenAI API Key.");
  }
  log.debug("got API key");
  return rows[0].value;
}

interface ChatOptions {
  input: string;
  account_id?: string;
  project_id?: string;
  path?: string;
}

export async function evaluate({
  input,
  account_id,
  project_id,
  path,
}: ChatOptions): Promise<string> {
  log.debug("evaluate", { input, account_id, project_id, path });
  const { ChatGPTAPI } = await importDynamic("chatgpt");
  const api = new ChatGPTAPI({ apiKey: await getApiKey() });
  const res = await api.sendMessage(input);
  const output = res.text;
  const total_tokens = res.detail?.usage?.total_tokens;
  log.debug("got res = ", res);
  saveResponse({ input, output, account_id, project_id, path, total_tokens });
  return output;
}

// Save mainly for analytics, metering, and to generally see how (or if)
// people use chatgpt in cocalc.
// Also, we could dedup identical inputs (?).
async function saveResponse({
  input,
  output,
  account_id,
  project_id,
  path,
  total_tokens,
}) {
  const pool = getPool();
  try {
    await pool.query(
      "INSERT INTO openai_chatgpt_log(time,input,output,account_id,project_id,path,total_tokens) VALUES(NOW(),$1,$2,$3,$4,$5,$6)",
      [input, output, account_id, project_id, path, total_tokens]
    );
  } catch (err) {
    log.warn("Failed to save ChatGPT log entry to database:", err);
  }
}
