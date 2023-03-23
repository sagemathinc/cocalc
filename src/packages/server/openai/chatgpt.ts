/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { Configuration, OpenAIApi } from "openai";
import { checkForAbuse } from "./abuse";
import { get_server_settings } from "@cocalc/database/postgres/server-settings";
import { db } from "@cocalc/database";
import { pii_retention_to_future } from "@cocalc/database/postgres/pii";

const log = getLogger("chatgpt");

async function getConfig(): Promise<{
  apiKey: string;
  expire: Date | undefined;
}> {
  log.debug("get API key");
  const server_settings = await get_server_settings(db());
  const { openai_api_key, pii_retention } = server_settings;

  if (!openai_api_key) {
    log.debug("NO API key");
    throw Error("You must provide an OpenAI API Key.");
  }
  log.debug("got API key");
  return {
    apiKey: openai_api_key,
    expire: pii_retention_to_future(pii_retention),
  };
}

interface ChatOptions {
  input: string; // new input that user types
  system?: string; // extra setup that we add for relevance and context
  account_id?: string;
  project_id?: string;
  path?: string;
  analytics_cookie?: string;
  history?: { role: "assistant" | "user" | "system"; content: string }[];
}

export async function evaluate({
  input,
  system,
  account_id,
  project_id,
  path,
  analytics_cookie,
  history,
}: ChatOptions): Promise<string> {
  log.debug("evaluate", {
    input,
    history,
    system,
    account_id,
    analytics_cookie,
    project_id,
    path,
  });
  const start = Date.now();
  await checkForAbuse({ account_id, analytics_cookie });
  const { apiKey, expire } = await getConfig();

  const configuration = new Configuration({ apiKey });
  const openai = new OpenAIApi(configuration);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  if (history) {
    for (const message of history) {
      messages.push(message);
    }
  }
  messages.push({ role: "user", content: input });
  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages,
  });
  log.debug("response: ", completion.data);
  const output = (
    completion.data.choices[0].message?.content ?? "No Output"
  ).trim();
  const total_tokens = completion.data.usage?.total_tokens;
  const total_time_s = (Date.now() - start) / 1000;
  saveResponse({
    input,
    system,
    output,
    history,
    account_id,
    analytics_cookie,
    project_id,
    path,
    total_tokens,
    total_time_s,
    expire,
  });
  return output;
}

// Save mainly for analytics, metering, and to generally see how (or if)
// people use chatgpt in cocalc.
// Also, we could dedup identical inputs (?).
async function saveResponse({
  input,
  system,
  output,
  history,
  account_id,
  analytics_cookie,
  project_id,
  path,
  total_tokens,
  total_time_s,
  expire,
}) {
  const pool = getPool();
  try {
    await pool.query(
      "INSERT INTO openai_chatgpt_log(time,input,system,output,history,account_id,analytics_cookie,project_id,path,total_tokens,total_time_s,expire) VALUES(NOW(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        input,
        system,
        output,
        history,
        account_id,
        analytics_cookie,
        project_id,
        path,
        total_tokens,
        total_time_s,
        expire,
      ]
    );
  } catch (err) {
    log.warn("Failed to save ChatGPT log entry to database:", err);
  }
}
