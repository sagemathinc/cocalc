import { evaluate } from "@cocalc/server/openai/chatgpt";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { analytics_cookie_name } from "@cocalc/util/misc";

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
  const { input, system } = getParams(req);
  const account_id = await getAccountId(req);
  const analytics_cookie = req.cookies[analytics_cookie_name];
  return {
    output: await evaluate({ account_id, analytics_cookie, input, system }),
  };
}
