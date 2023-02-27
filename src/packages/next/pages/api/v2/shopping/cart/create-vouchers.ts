import createVouchers from "@cocalc/server/shopping/cart/create-vouchers";
import getAccountId from "lib/account/get-account";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
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
  const { count, expire, title, length, charset, prefix, postfix } =
    getParams(req);
  if (count == null) {
    throw Error("must provide number of vouchers");
  }
  if (expire == null) {
    throw Error("must provide expiration date");
  }
  if (title == null) {
    throw Error("must provide title");
  }
  if (length == null || length < 6 || length > 16) {
    throw Error("must provide length that is at least 6 and less than 16");
  }
  if (prefix == null) {
    throw Error("must provide prefix");
  }
  if (postfix == null) {
    throw Error("must provide postfix");
  }
  if (charset == null) {
    throw Error("must provide charset");
  }
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to check out");
  }
  if (!(await userIsInGroup(account_id, "partner"))) {
    throw Error("only partners can create vouchers");
  }
  return await createVouchers({
    account_id,
    count,
    expire: new Date(expire),
    title,
    generate: { length, prefix, postfix, charset },
  });
}
