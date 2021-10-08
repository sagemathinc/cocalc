import getPool from "@cocalc/util-node/database";

export default async function isAccountAvailable(
  email_address: string
): Promise<boolean> {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    "SELECT account_id FROM accounts WHERE email_address=$1",
    [email_address]
  );
  return rows.length == 0;
}
