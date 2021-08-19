import getPool from "lib/database";
import { isUUID } from "lib/util";

export interface AccountInfo {
  accountID: string;
  firstName: string;
  lastName: string;
}

export default async function getAccountInfo(
  accountID: string
): Promise<AccountInfo> {
  if (!isUUID(accountID)) {
    throw Error("invalid UUID");
  }
  const pool = getPool();

  // Get the database entry
  const { rows } = await pool.query(
    "SELECT first_name, last_name FROM accounts WHERE unlisted IS NOT TRUE AND account_id=$1",
    [accountID]
  );
  if (rows.length == 0) {
    throw Error("no such user");
  }
  const firstName = rows[0].first_name;
  const lastName = rows[0].last_name;
  return { accountID, firstName, lastName };
}
