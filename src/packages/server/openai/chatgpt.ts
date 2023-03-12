/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getPool from "@cocalc/database/pool";

// fetch polyfill -- see https://github.com/transitive-bullshit/chatgpt-api/issues/376
import "isomorphic-fetch";

// See https://github.com/transitive-bullshit/chatgpt-api/issues/367
const importDynamic = new Function("modulePath", "return import(modulePath)");

async function getApiKey(): Promise<string> {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    "SELECT value FROM server_settings WHERE name='openai_api_key'"
  );
  if (rows.length == 0 || !rows[0].value) {
    throw Error("You must provide an OpenAI API Key.");
  }
  return rows[0].value;
}

interface ChatOptions {
  input: string;
  account_id: string;
  project_id?: string;
  path?: string;
}

export async function evaluate({
  input,
  account_id,
  project_id,
  path,
}: ChatOptions): Promise<string> {
  const { ChatGPTAPI } = await importDynamic("chatgpt");
  const api = new ChatGPTAPI({ apiKey: await getApiKey() });
  const res = await api.sendMessage(input);
  const output = res.text;
  const total_tokens = res.detail?.total_tokens;
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
  await pool.query(
    "INSERT INTO chatgpt(time,input,output,account_id,project_id,path,total_tokens) VALUES(NOW(),$1,$2,$3,$5,$5,$6)",
    [input, output, account_id, project_id, path, total_tokens]
  );
}
