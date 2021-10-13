/*
Enforce limits on the number of that a user can cause to be sent.

For now starting with a simple limit: at most 1000 messages per day.
*/

import getPool from "@cocalc/backend/database";

export default async function sendEmailThrottle(
  account_id?: string
): Promise<void> {
  if (!account_id) return; // not associated to a particular user
  const day = startOfToday();
  // get current count
  const pool = getPool("short"); // a few seconds old is ok...
  const { rows } = await pool.query(
    "SELECT count FROM email_counter WHERE time=$1 AND account_id=$2",
    [day, account_id]
  );
  if (rows.length > 0 && rows[0].count > 1000) {
    throw Error(
      "A user may send at most 1000 emails per day, and you have hit that limit.  No further emails will get sent on your behalf."
    );
  }
  // Increment the counter.
  if (rows.length > 0) {
    // This will always work with no race conditions, since the given entry exists.
    await pool.query(
      "UPDATE email_counter SET count = count + 1 WHERE account_id=$1 AND time=$2",
      [account_id, day]
    );
  } else {
    // It's possible another server created email_counter in the meantime,
    // hence the "ON CONFLICT".
    await pool.query(
      "INSERT INTO email_counter (account_id,time,count) VALUES($1,$2,1) ON CONFLICT (account_id, time) DO UPDATE SET count = excluded.count + 1",
      [account_id, day]
    );
  }
}

function startOfToday(): Date {
  // https://stackoverflow.com/questions/7195513/how-do-you-get-the-unix-timestamp-for-the-start-of-today-in-javascript
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
