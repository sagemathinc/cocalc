import redeemVoucher from "@cocalc/server/vouchers/redeem";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const license_ids = await doIt(req);
    res.json({ license_ids, success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

// returns array of license ids
async function doIt(req): Promise<string[]> {
  const { code, project_id } = getParams(req);
  if (!code || code.length < 8) {
    throw Error("code must be at least 8 characters long");
  }
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to redeem a voucher code");
  }

  return await redeemVoucher({ account_id, code, project_id });
}
