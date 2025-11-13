import getPool from "@cocalc/database/pool";

export async function banUser(account_id: string): Promise<void> {
  const pool = getPool();
  // Delete all of the their auth tokens
  await pool.query("DELETE FROM auth_tokens WHERE account_id = $1::UUID", [
    account_id,
  ]);
  // Ban them
  await pool.query(
    "UPDATE accounts SET banned=true WHERE account_id = $1::UUID",
    [account_id],
  );
}

export async function removeUserBan(account_id: string): Promise<void> {
  const pool = getPool();
  // remove their ban
  await pool.query(
    "UPDATE accounts SET banned=false WHERE account_id = $1::UUID",
    [account_id],
  );
}
