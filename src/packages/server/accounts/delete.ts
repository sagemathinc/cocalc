import { is_valid_uuid_string as isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import { deleteAllRememberMe } from "@cocalc/server/auth/remember-me";

export default async function deleteAccount(account_id: string): Promise<void> {
  if (!isValidUUID(account_id)) {
    throw Error(`invalid account_id=${account_id}`);
  }

  // Cancel any subscriptions
  await cancelSubscriptions(account_id);

  // Invalidate all sign ins (without this user can delete account, but could still be signed in).
  await deleteAllRememberMe(account_id);

  // Mark the account as deleted
  await markAccountDeleted(account_id);
}

/*
Mark the account as deleted, thus freeing up the email address and passports
for use by another account, etc. The actual account entry remains in the
database, since it may be referred to by many other things (projects, logs,
etc.). However, the deleted field is set to true, so the account is excluded
from user search and it is not possible to sign in to this account.
We also save the email address from before deleting the account, since
that would be very useful in case a user requests to undelete an account,
or in case of bad users.

TODO: Obviously, at some point we should permanently delete all PII from
any deleted accounts, e.g., delete the email_address_before_delete field.
*/

export async function markAccountDeleted(account_id: string): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT email_address FROM accounts WHERE account_id=$1",
    [account_id]
  );
  if (rows.length == 0) {
    throw Error(`no account with account_id=${account_id}`);
  }
  const email_address_before_delete = rows[0].email_address ?? "";
  await pool.query(
    "UPDATE accounts SET deleted=true, email_address_before_delete=$1::TEXT, email_address=NULL, passports=NULL WHERE account_id=$2::UUID",
    [email_address_before_delete, account_id]
  );
}

export async function cancelSubscriptions(account_id: string): Promise<void> {
  // TODO
}
