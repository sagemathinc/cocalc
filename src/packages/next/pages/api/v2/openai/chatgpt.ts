import { evaluate } from "@cocalc/server/openai/chatgpt";
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
  const { input } = getParams(req);
  const account_id = await getAccountId(req);
  return { output: await evaluate({ account_id, input }) };
}
