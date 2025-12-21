import getBalance from "@cocalc/server/purchases/get-balance";
import getMinBalance0 from "@cocalc/server/purchases/get-min-balance";
import { resolveMembershipForAccount } from "@cocalc/server/membership/resolve";

export { getBalance };

export async function getMinBalance({ account_id }) {
  return await getMinBalance0(account_id);
}

export async function getMembership({ account_id }) {
  return await resolveMembershipForAccount(account_id);
}
