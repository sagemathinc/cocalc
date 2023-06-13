// [ ] TODO: rewrite this to have the closing date be an integer 1-28 in the database!

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchase:closing-date");

// Get the purchase closing date for the account, or set it today if none is set.
// Returns midnight UTC.
export async function getClosingDate(account_id: string): Promise<Date> {
  const pool = getPool("medium");
  let closingDate: Date;

  try {
    const result = await pool.query(
      "SELECT purchase_closing_date FROM accounts WHERE account_id = $1",
      [account_id]
    );
    closingDate = result.rows?.[0]?.["purchase_closing_date"];
    if (closingDate == null) {
      // If no closing date exists, set it to today (midnight UTC)
      closingDate = new Date();
      closingDate.setUTCHours(0, 0, 0, 0);
      await setClosingDate(account_id, closingDate);
    }
  } catch (e) {
    logger.error(`Error getting closing date: ${e.message}`);
    throw e;
  }

  return closingDate;
}

export async function setClosingDate(
  account_id: string,
  date: Date
): Promise<void> {
  const pool = getPool("medium");
  date.setUTCHours(0, 0, 0, 0);
  try {
    await pool.query(
      "UPDATE accounts SET purchase_closing_date = $1 WHERE account_id = $2",
      [date, account_id]
    );
  } catch (e) {
    logger.error(`Error setting closing date: ${e.message}`);
    throw e;
  }
}
