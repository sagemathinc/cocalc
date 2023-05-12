import { search } from "@cocalc/server/openai/embeddings-api";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    throw Error("currently disabled");
    const matches = await doIt(req);
    res.json({ matches, success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req) {
  const account_id = await getAccountId(req);
  if (!account_id) {
    throw Error("must be signed in");
  }
  return await search({ ...getParams(req), account_id } as any);
}
