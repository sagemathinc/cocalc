import { evaluate } from "@cocalc/server/openai/chatgpt";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { STATISTICS_COOKIE_NAME } from "@cocalc/util/misc";

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
  const { input, system, history, model } = getParams(req);
  const account_id = await getAccountId(req);
  const analytics_cookie = req.cookies[STATISTICS_COOKIE_NAME];
  return {
    output: await evaluate({
      account_id,
      analytics_cookie,
      input,
      system,
      history,
      model,
    }),
  };
}
