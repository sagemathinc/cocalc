import getPool from "@cocalc/database/pool";
import { NUM_MESSAGES } from "@cocalc/util/db-schema/messages";

export async function updateUnreadMessageCount({ account_id }) {
  const pool = getPool();

  // have to use a subquery because we want to restrict only to the most recent NUM_MESSAGES messages, since that's
  // what we provide the user.  If they have 300 read messages and message 301 is unread, the count is still 0 -- it's too
  // old to matter.
  const { rows: counts } = await pool.query(
    `
  SELECT COUNT(*) AS unread_count
FROM (
    SELECT read, COALESCE(saved, false) AS saved, COALESCE(deleted, false) AS deleted
    FROM messages
    WHERE to_type = 'account' AND to_id=$1 AND sent IS NOT NULL AND sent != TO_TIMESTAMP(0)
    ORDER BY id DESC
    LIMIT ${NUM_MESSAGES}
) AS subquery
WHERE (read IS NULL OR read = TO_TIMESTAMP(0)) AND saved=false AND deleted=false`,
    [account_id],
  );

  const { unread_count } = counts[0];
  await pool.query(
    "UPDATE accounts SET unread_message_count=$1 WHERE account_id=$2",
    [unread_count, account_id],
  );
}
