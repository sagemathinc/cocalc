/*
Backend server side part of ChatGPT integration with CoCalc.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { Configuration, OpenAIApi } from "openai";
import { checkForAbuse } from "./abuse";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { pii_retention_to_future } from "@cocalc/database/postgres/pii";
import type { Model } from "@cocalc/util/db-schema/openai";

const log = getLogger("chatgpt");

async function getConfig(): Promise<{
  apiKey: string;
  expire: Date | undefined;
}> {
  log.debug("get API key");
  const server_settings = await getServerSettings();
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
  model?: Model; // default is gpt-3.5-turbo
}

export async function evaluate({
  input,
  system,
  account_id,
  project_id,
  path,
  analytics_cookie,
  history,
  model = "gpt-3.5-turbo",
}: ChatOptions): Promise<string> {
  log.debug("evaluate", {
    input,
    history,
    system,
    account_id,
    analytics_cookie,
    project_id,
    path,
    model,
  });
  const start = Date.now();
  await checkForAbuse({ account_id, analytics_cookie, model });
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
    expire: account_id == null ? expire : undefined,
    model,
  });

  // NOTE about expire: If the admin setting for "PII Retention" is set *and*
  // the usage is only identified by their analytics_cookie, then
  // we automatically delete the log of chatgpt usage at the expiration time.
  // If the account_id *is* set, users can do the following:
  // 1. Ability to delete any of their past chatgpt usage
  // 2. If a user deletes their account, also delete their past chatgpt usage log.
  // 3. Make it easy to search and see their past usage.
  // See https://github.com/sagemathinc/cocalc/issues/6577
  // There's no reason to automatically delete "PII" attached
  // to an actual user that has access to that data (and can delete it); otherwise,
  // we would have to delete every single thing anybody types anywhere in cocalc,
  // e.g., when editing a Jupyter notebook or really anything else at all, and
  // that makes no sense at all.

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
  model,
}) {
  const pool = getPool();
  try {
    await pool.query(
      "INSERT INTO openai_chatgpt_log(time,input,system,output,history,account_id,analytics_cookie,project_id,path,total_tokens,total_time_s,expire,model) VALUES(NOW(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
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
        model,
      ]
    );
  } catch (err) {
    log.warn("Failed to save ChatGPT log entry to database:", err);
  }
}
