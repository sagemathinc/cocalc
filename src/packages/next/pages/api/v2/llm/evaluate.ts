// This is the new endpoint for querying any LLM
// Previously, this has been in openai/chatgpt

import { evaluate } from "@cocalc/server/llm/index";
import { analytics_cookie_name } from "@cocalc/util/misc";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const result = await doIt(req);
    res.json({ ...result, success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req) {
  const { input, system, history, model, tag } = getParams(req);
  const account_id = await getAccountId(req);
  const analytics_cookie = req.cookies[analytics_cookie_name];
  return {
    output: await evaluate({
      account_id,
      analytics_cookie,
      input,
      system,
      history,
      model,
      tag,
    }),
  };
}
