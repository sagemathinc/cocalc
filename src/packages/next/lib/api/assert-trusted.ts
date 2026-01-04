import { db } from "@cocalc/database";
import { is_admin } from "@cocalc/database/postgres/account-queries";
import { getServerSettings } from "@cocalc/database/settings";
import getMinBalance from "@cocalc/server/purchases/get-min-balance";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { currency } from "@cocalc/util/misc";

const THRESH = -100;
export const TRUST_ERROR_MESSAGE = `Please contact support and request a minimum balance that is under ${currency(
  THRESH,
)} to access this API endpoint.`;

export default async function assertTrusted(account_id: string): Promise<void> {
  if (process.env.COCALC_DB === "pglite") {
    return;
  }
  const { kucalc } = await getServerSettings();

  if (kucalc === KUCALC_COCALC_COM) {
    // on cocalc.com, we check if users have gained trust by giving them a lower min balance
    if ((await getMinBalance(account_id)) > THRESH) {
      throw new Error(TRUST_ERROR_MESSAGE);
    }
  } else {
    // for on-prem instances, only admins are allowed to create accounts
    if (!(await is_admin(db(), account_id))) {
      throw new Error(
        "Only users in the group 'admin' are allowed to create new users.",
      );
    }
  }
}
