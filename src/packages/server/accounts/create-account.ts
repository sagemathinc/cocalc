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
import { getLogger } from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

const log = getLogger("server:accounts:create");

interface Params {
  email?: string;
  password?: string;
  firstName: string;
  lastName: string;
  account_id: string;
  tags?: string[];
  signupReason?: string;
  owner_id?: string;
  // if set, do not do any of the various heuristics to create or start user's first project.
  // I added this to avoid leaks with unit testing, but it may be useful in other contexts, e.g.,
  // avoiding confusion with self-hosted installs.
  noFirstProject?: boolean;
  ephemeral?: number;
  customize?: any;
}

export default async function createAccount({
  email,
  password,
  firstName,
  lastName,
  account_id,
  tags,
  signupReason,
  owner_id,
  noFirstProject,
  ephemeral,
  customize,
}: Params): Promise<void> {
  if (!email) {
    throw Error("Email address is required for account creation.");
  }
  try {
    log.debug(
      "creating account",
      email,
      firstName,
      lastName,
      account_id,
      tags,
      signupReason,
    );
    const pool = getPool();
    await pool.query(
      "INSERT INTO accounts (email_address, password_hash, first_name, last_name, account_id, created, tags, sign_up_usage_intent, owner_id, ephemeral, customize) VALUES($1::TEXT, $2::TEXT, $3::TEXT, $4::TEXT, $5::UUID, NOW(), $6::TEXT[], $7::TEXT, $8::UUID, $9::BIGINT, $10::JSONB)",
      [
        email ? email : undefined, // can't insert "" more than once!
        password ? passwordHash(password) : undefined, // definitely don't set password_hash to hash of empty string, e.g., anonymous accounts can then NEVER switch to email/password.  This was a bug in production for a while.
        firstName,
        lastName,
        account_id,
        tags,
        signupReason,
        owner_id,
        ephemeral ?? null,
        customize ?? null,
      ],
    );
    const { insecure_test_mode } = await getServerSettings();
    if (insecure_test_mode) {
      log.debug("Creating account in insecure_test_mode!");
      await pool.query("UPDATE accounts SET groups=$1 WHERE account_id=$2", [
        ["admin"],
        account_id,
      ]);
    }

    await accountCreationActions({
      email_address: email,
      account_id,
      tags,
      noFirstProject,
      ephemeral,
    });
    await creationActionsDone(account_id);
  } catch (error) {
    log.error("Error creating account", error);
    throw error; // re-throw to bubble up to higher layers if needed
  }
}
