/*
Get shopping cart for signed in user.  Can also optionally get everything
ever removed from cart, and also everything ever purchased.
*/

import checkout from "@cocalc/server/shopping/cart/checkout";
import getAccountId from "lib/account/get-account";
import reCaptcha from "@cocalc/server/auth/recaptcha";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

export default async function handle(req, res) {
  try {
    await doIt(req);
    res.json({ success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to check out");
  }
  if (!(await userIsInGroup(account_id, "partner"))) {
    // require the captcha to work unless requesting account is a partner.
    await reCaptcha(req);
  }
  return await checkout(account_id);
}
