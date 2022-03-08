/*
Create account.  Doesn't do any checking that server allows
for this type of account, etc. -- that is assumed to have been
done before calling this.
*/

import getPool from "@cocalc/database/pool";
import passwordHash from "@cocalc/backend/auth/password-hash";
import accountCreationActions, {
  creationActionsDone,
} from "./account-creation-actions";

interface Params {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  account_id: string;
}

export default async function createAccount({
  email,
  password,
  firstName,
  lastName,
  account_id,
}: Params): Promise<void> {
  const pool = getPool();
  await pool.query(
    "INSERT INTO accounts (email_address, password_hash, first_name, last_name, account_id, created) VALUES($1::TEXT, $2::TEXT, $3::TEXT, $4::TEXT, $5::UUID, NOW())",
    [
      email ? email : undefined, // can't insert "" more than once!
      password ? passwordHash(password) : undefined, // definitely don't set password_hash to hash of empty string, e.g., anonymous accounts can then NEVER switch to email/password.  This was a bug in production for a while.
      firstName,
      lastName,
      account_id,
    ]
  );
  if (email) {
    await accountCreationActions(email, account_id);
  }
  await creationActionsDone(account_id);
}
