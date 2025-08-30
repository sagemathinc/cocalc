import isAdmin from "@cocalc/server/accounts/is-admin";
import { generate } from "random-key";
import getPool from "@cocalc/database/pool";
import isPasswordCorrect from "./is-password-correct";
import centralLog from "@cocalc/database/postgres/central-log";

// map {account_id:{user_account_id:timestamp}}
const ban: { [account_id: string]: { [user_account_id: string]: number } } = {};
const BAN_TIME_MS = 1000 * 30;

export async function generateUserAuthToken({
  account_id,
  user_account_id,
  password = "",
}: {
  account_id?: string;
  user_account_id: string;
  password?: string;
}): Promise<string> {
  if (account_id == null) {
    throw Error("must specify account_id");
  }
  const b = ban[account_id]?.[user_account_id];
  if (b && Date.now() - b < BAN_TIME_MS) {
    throw Error(
      `banned -- please wait at least #{BAN_TIME_MS/1000}s before trying again`,
    );
  }
  const is_admin = await isAdmin(account_id);
  if (!is_admin) {
    // not admin, so check password
    if (!(await isPasswordCorrect({ account_id: user_account_id, password }))) {
      if (ban[account_id] == null) {
        ban[account_id] = {};
      }
      ban[account_id][user_account_id] = Date.now();
      throw Error("incorrect password");
    }
  }

  // ready to go
  return await createAuthTokenNoCheck({
    user_account_id,
    created_by: account_id,
    is_admin,
  });
}

export async function createAuthTokenNoCheck({
  user_account_id,
  created_by,
  is_admin,
  expire = Date.now() + 1000 * 60 * 60 * 12,
}: {
  user_account_id: string;
  created_by: string;
  is_admin: boolean;
  expire?: number;
}): Promise<string> {
  const authToken = generate(24);
  const pool = getPool();
  await pool.query(
    "INSERT INTO auth_tokens (auth_token, expire, account_id, created_by, created, is_admin) VALUES($1, $2, $3, $4, NOW(), $5)",
    [authToken, new Date(expire), user_account_id, created_by, is_admin],
  );
  await centralLog({
    event: "auth-token",
    value: { account_id: created_by, user_account_id, is_admin },
  });
  return authToken;
}

export async function revokeUserAuthToken(authToken: string) {
  const pool = getPool();
  await pool.query("DELETE FROM auth_tokens WHERE auth_token=$1", [authToken]);
}
