import getPool from "@cocalc/database/pool";
import {
  NUM_MESSAGES,
  isBitSetField,
  BitSetField,
} from "@cocalc/util/db-schema/messages";
import { isValidUUID } from "@cocalc/util/misc";

export async function updateUnreadMessageCount({ account_id }) {
  const pool = getPool();

  // have to use a subquery because we want to restrict only to the most recent NUM_MESSAGES messages, since that's
  // what we provide the user.  If they have 300 read messages and message 301 is unread, the count is still 0 -- it's too
  // old to matter... for the inbox counter.
  const query = `
  SELECT COUNT(*) AS unread_count
FROM (
    SELECT
      ${bitField("read", account_id)},
      ${bitField("saved", account_id)},
      ${bitField("deleted", account_id)}
    FROM messages
    WHERE $1=ANY(to_ids) AND sent IS NOT NULL
    ORDER BY id DESC
    LIMIT ${NUM_MESSAGES}
) AS subquery
WHERE read=false AND saved=false AND deleted=false`;
  const { rows: counts } = await pool.query(query, [account_id]);

  const { unread_count } = counts[0];
  console.log(counts);
  await pool.query(
    "UPDATE accounts SET unread_message_count=$1 WHERE account_id=$2",
    [unread_count, account_id],
  );
}

function bitField(field: BitSetField, account_id: string) {
  // be extra careful due to possibility of SQL injection.
  if (!isBitSetField(field)) {
    throw Error(`field ${field} must be a bitset field`);
  }
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be valid");
  }
  return `coalesce(substring(${field},array_position(to_ids,'${account_id}')+1,1),'0'::bit(1)) = '1'::bit(1) AS ${field}`;
}
