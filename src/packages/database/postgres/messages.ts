import getPool from "@cocalc/database/pool";
import { NUM_MESSAGES, pgBitField } from "@cocalc/util/db-schema/messages";

export async function updateUnreadMessageCount({ account_id }) {
  const pool = getPool();

  // have to use a subquery because we want to restrict only to the most recent NUM_MESSAGES messages, since that's
  // what we provide the user.  If they have 300 read messages and message 301 is unread, the count is still 0 -- it's too
  // old to matter... for the inbox counter.
  const query = `
  SELECT COUNT(*) AS unread_count
FROM (
    SELECT
      ${pgBitField("read", account_id)},
      ${pgBitField("saved", account_id)},
      ${pgBitField("deleted", account_id)}
    FROM messages
    WHERE $1=ANY(to_ids) AND sent IS NOT NULL
    ORDER BY id DESC
    LIMIT ${NUM_MESSAGES}
) AS subquery
WHERE read=false AND saved=false AND deleted=false`;
  const { rows: counts } = await pool.query(query, [account_id]);

  const { unread_count } = counts[0];
  await pool.query(
    "UPDATE accounts SET unread_message_count=$1 WHERE account_id=$2",
    [unread_count, account_id],
  );
}
