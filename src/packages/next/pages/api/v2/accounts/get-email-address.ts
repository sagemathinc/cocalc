/*
Get the email address, if there is one, associated to an account_id.

SECURITY:  This is only available to admins and partners, i.e.,
highly privileged accounts, since we don't want anybody to be able
to dump our email addresses and spam people.
*/

import getAccountId from "lib/account/get-account";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetAccountEmailAddressInputSchema,
  GetAccountEmailAddressOutputSchema,
} from "lib/api/schema/accounts/get-email-address";

async function handle(req, res) {
  const { account_id } = getParams(req);
  const user_account_id = await getAccountId(req);
  try {
    res.json({ email_address: await getAddress(user_account_id, account_id) });
  } catch (err) {
    res.json({ error: err.message });
  }
}

async function getAddress(
  user_account_id: string | undefined,
  account_id: string | undefined,
): Promise<string | undefined> {
  if (account_id == null) return undefined;
  // check that user_account_id is admin or partner
  if (
    user_account_id == null ||
    (!(await userIsInGroup(user_account_id, "partner")) &&
      !(await userIsInGroup(user_account_id, "admin")))
  ) {
    throw Error(
      "you must be an admin or partner to get the email address of any account_id",
    );
  }

  // get the address
  return await getEmailAddress(account_id);
}

export default apiRoute({
  getEmailAddress: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Accounts", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: GetAccountEmailAddressInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetAccountEmailAddressOutputSchema,
      },
    ])
    .handler(handle),
});
