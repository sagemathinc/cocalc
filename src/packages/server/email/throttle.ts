/*
Enforce limits on the number of that a user can cause to be sent.

For now starting with a simple limit: at most XXX messages per day.
*/

const DAILY_LIMIT = 1000;

import getPool from "@cocalc/database/pool";

// Call this function whenever an email will be sent on behalf of the given account.
// It will increment a counter for each day, and if it goes too high it throws
// an exceptions, which prevents further emais from being sent for that user.
export default async function sendEmailThrottle(
  id?: string // account_id or project_id or organization_id...
): Promise<void> {
  if (!id) return; // not associated to a particular user
  const day = startOfToday();
  // get current count
  const pool = getPool("short"); // a few seconds old is ok...
  const { rows } = await pool.query(
    "SELECT count FROM email_counter WHERE time=$1 AND id=$2",
    [day, id]
  );
  if (rows.length > 0 && rows[0].count > DAILY_LIMIT) {
    throw Error(
      `You may send at most ${DAILY_LIMIT} emails per day, and you have reached that limit.`
    );
  }
  // Increment the counter.
  if (rows.length > 0) {
    // This will always work with no race conditions, since the given entry exists.
    await pool.query(
      "UPDATE email_counter SET count = count + 1 WHERE id=$1 AND time=$2",
      [id, day]
    );
  } else {
    // It's possible another server created email_counter in the meantime,
    // hence the "ON CONFLICT".
    await pool.query(
      "INSERT INTO email_counter (id,time,count) VALUES($1,$2,1) ON CONFLICT (id, time) DO UPDATE SET count = excluded.count + 1",
      [id, day]
    );
  }
}

function startOfToday(): Date {
  // https://stackoverflow.com/questions/7195513/how-do-you-get-the-unix-timestamp-for-the-start-of-today-in-javascript
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
