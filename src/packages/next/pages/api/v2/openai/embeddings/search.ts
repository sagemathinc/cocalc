import { search } from "@cocalc/server/openai/embeddings-api";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const matches = await doIt(req);
    res.json({ matches, success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req) {
  const { input, filter, limit, selector } = getParams(req);
  const account_id = await getAccountId(req);
  if (!account_id) {
    throw Error("must be signed in");
  }
  return await search({ account_id, input, filter, limit, selector });
}
