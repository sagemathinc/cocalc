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

// The name should be something like "google-9999601658192", i.e., a key
// of the passports field.
interface Options {
  account_id: string;
  name: string;
}
export default async function unlinkStrategy({
  account_id,
  name,
}: Options): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE accounts SET passports = passports - $2 WHERE account_id=$1",
    [account_id, name]
  );
}
