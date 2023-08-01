import type {
  Description,
  TokenAction,
} from "@cocalc/util/db-schema/token-actions";
import getPool from "@cocalc/database/pool";

/*
If a user visits the URL for an action link, then this gets called.
*/

export default async function handleTokenAction(token: string): Promise<any> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT token, expire, description FROM token_actions WHERE token=$1",
    [token]
  );
  if (rows.length == 0) {
    throw Error(`no such token ${token}`);
  }
  const action = rows[0] as TokenAction;
  if (action.expire <= new Date()) {
    throw Error(`no such token ${token}`);
  }
  try {
    return await handleDescription(action.description);
  } finally {
    await pool.query("DELETE FROM token_actions WHERE token=$1", [token]);
  }
}

async function handleDescription(description: Description): Promise<any> {
  switch (description.type) {
    case "disable-daily-statements":
      await disableDailyStatements(description.account_id);
      return;
    default:
      throw Error(`action of type ${description.type} not implemented`);
  }
}

async function disableDailyStatements(account_id: string) {
  const pool = getPool();
  await pool.query(
    "UPDATE accounts SET email_daily_statements=false WHERE account_id=$1",
    [account_id]
  );
}
