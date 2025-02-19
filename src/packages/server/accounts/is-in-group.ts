import getPool from "@cocalc/database/pool";

export type Group = "admin" | "partner" | "crm";

export default async function userIsInGroup(
  account_id: string,
  group: Group,
): Promise<boolean> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT groups FROM accounts WHERE account_id=$1",
    [account_id],
  );
  return !!rows[0]?.groups?.includes(group);
}
