import setVoucherCodeNotes from "@cocalc/server/vouchers/set-voucher-code-notes";
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
  const { code, notes } = getParams(req);
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  return { codes: await setVoucherCodeNotes({ account_id, code, notes }) };
}
