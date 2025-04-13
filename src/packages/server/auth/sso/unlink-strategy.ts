/*
Function for unlinking a strategy from the user profile.

We provide this rather than just allowing the user to directly edit the
passports part of their account via a user_query entirely for security reasons.
I don't specifically know of any issues with allowing such editing, but it
seems potentially dangerous... and longterm it is nice to assume that we
can trust the contents of the passports field of accounts came from the
upstream SSO provider.
*/

import getPool from "@cocalc/database/pool";
import getStrategies from "@cocalc/database/settings/get-sso-strategies";
import { is_valid_uuid_string } from "@cocalc/util/misc";
import { checkRequiredSSO } from "@cocalc/util/auth-check-required-sso";

// The name should be something like "google-9999601658192", i.e., a key
// of the passports field.
interface Options {
  account_id: string;
  name: string;
}
export default async function unlinkStrategy(opts: Options): Promise<void> {
  const { account_id, name } = opts;

  if (typeof name !== "string" || name.length === 0) {
    throw new Error("name must be a nonempty string");
  }

  if (!is_valid_uuid_string(account_id)) {
    throw new Error("account_id must be a valid uuid");
  }

  const strategyName = name.split("-")[0];

  const pool = getPool();

  if (await isBlockedUnlinkStrategy({ strategyName, account_id })) {
    throw new Error("You are not allowed to unlink this SSO account");
  }

  // if we can't find the strategy, we still let users unlink it – maybe no longer available?
  await pool.query(
    "UPDATE accounts SET passports = passports - $2 WHERE account_id=$1",
    [account_id, name],
  );
}

interface Opts {
  strategyName: string;
  account_id: string;
}

export async function isBlockedUnlinkStrategy(opts: Opts): Promise<boolean> {
  const { strategyName, account_id } = opts;

  // You're not allowed to unlink a strategy, if it is "exclusive" for your account.
  // Hence we check if your email addresses domain covered by in the info.exclusive_domains array of the strategy
  // Why is this blocked? This might make it possible for a user to detach their account from the control of that SSO provider.

  const pool = getPool();

  const emailQuery = await pool.query(
    "SELECT email_address FROM accounts WHERE account_id=$1",
    [account_id],
  );
  const email = emailQuery.rows[0].email_address;
  if (email) {
    const strategies = await getStrategies();
    const requiredStrategy = checkRequiredSSO({
      email,
      strategies,
      specificStrategy: strategyName,
    });
    return requiredStrategy != null;
  }
  return false;
}
