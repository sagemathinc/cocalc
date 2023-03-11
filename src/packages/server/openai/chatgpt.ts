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

export async function demo(question: string) {
  console.log("ChatGPT demo", question);
  const { ChatGPTAPI } = await importDynamic("chatgpt");
  console.log(ChatGPTAPI);

  const api = new ChatGPTAPI({ apiKey: await getApiKey() });

  const res = await api.sendMessage(question);
  console.log(res);
}
