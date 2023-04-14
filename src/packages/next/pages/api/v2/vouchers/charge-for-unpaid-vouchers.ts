import chargeForUnpaidVouchers from "@cocalc/server/vouchers/charge-for-unpaid-vouchers";
import getAccountId from "lib/account/get-account";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

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
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to charge for unpaid vouchers");
  }
  if (!(await userIsInGroup(account_id, "admin"))) {
    throw Error("only admins can initiate the charge for unpaid vouchers");
  }

  return await chargeForUnpaidVouchers();
}
