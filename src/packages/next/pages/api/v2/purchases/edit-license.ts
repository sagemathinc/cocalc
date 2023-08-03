/*
Edit an existing license that you are a license manager of.
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import editLicense from "@cocalc/server/purchases/edit-license";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  const { license_id, changes } = getParams(req);
  return await editLicense({
    account_id,
    license_id,
    changes,
  });
}
