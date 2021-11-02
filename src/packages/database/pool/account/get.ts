import getPool from "@cocalc/database/pool";

// raises an exception if no such account.
export default async function getAccountId({
  email_address,
}: {
  email_address: string;
}): Promise<string> {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    "SELECT account_id FROM accounts WHERE email_address=$1",
    [email_address]
  );
  if (rows.length == 0) {
    throw Error(`no account with email address '${email_address}'`);
  }
  const { account_id } = rows[0];
  return account_id;
}
