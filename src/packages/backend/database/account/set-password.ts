import getPool from "@cocalc/backend/database";
import passwordHash from "@cocalc/backend/auth/password-hash";
export default async function setPassword(
  account_id: string,
  password: string
): Promise<void> {
  const pool = getPool();
  await pool.query("UPDATE accounts SET password_hash=$1 WHERE account_id=$2", [
    passwordHash(password),
    account_id,
  ]);
}
