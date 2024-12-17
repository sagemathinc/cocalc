/*
Get messages for a given user.
*/

import {
  MAX_LIMIT,
  type ApiMessagesGet,
  type MessageMe,
  pgBitFieldSelf,
  pgBitField,
  NON_BITSET_FIELDS,
} from "@cocalc/util/db-schema/messages";
import getPool from "@cocalc/database/pool";

export default async function get({
  account_id,
  limit = 100,
  offset = 0,
  type = "received",
  cutoff,
}: ApiMessagesGet): Promise<MessageMe[]> {
  if (limit > MAX_LIMIT) {
    throw Error(`limit must be at most ${MAX_LIMIT}`);
  }
  const params: any[] = [];
  const where: string[] = [];
  if (cutoff) {
    where.push(`sent > $${params.length + 1}`);
    params.push(cutoff);
  }
  let query;
  const fields = NON_BITSET_FIELDS.join(",");
  if (type == "sent") {
    where.push(`from_id = $${params.length + 1}::UUID`);
    params.push(account_id);
    query = `SELECT ${fields},
           ${pgBitFieldSelf("read")},
           ${pgBitFieldSelf("saved")},
           ${pgBitFieldSelf("deleted")} FROM messages`;
    where.push(`not ${pgBitFieldSelf("expire", "")}`);
  } else if (type == "received") {
    where.push(`$${params.length + 1}::UUID = ANY(to_ids)`);
    params.push(account_id);
    where.push("sent IS NOT NULL");
    query = `
    SELECT ${fields},
           ${pgBitField("read", account_id)},
           ${pgBitField("saved", account_id)},
           ${pgBitField("deleted", account_id)} FROM messages
`;
    where.push(`not ${pgBitField("expire", account_id, "")}`);
  } else if (type == "new") {
    query = `SELECT ${fields} FROM messages`;
    where.push(`$${params.length + 1}::UUID = ANY(to_ids)`);
    params.push(account_id);
    where.push("sent IS NOT NULL");
    where.push(`not ${pgBitField("read", account_id, "")}`);
    where.push(`not ${pgBitField("saved", account_id, "")}`);
    where.push(`not ${pgBitField("deleted", account_id, "")}`);
    where.push(`not ${pgBitField("expire", account_id, "")}`);
  } else if (type == "starred") {
    query = `SELECT ${fields} FROM messages`;
    where.push(`$${params.length + 1}::UUID = ANY(to_ids)`);
    params.push(account_id);
    where.push("sent IS NOT NULL");
    where.push(`${pgBitField("starred", account_id, "")}`);
    where.push(`not ${pgBitField("deleted", account_id, "")}`);
    where.push(`not ${pgBitField("expire", account_id, "")}`);
  }

  query += " WHERE " + where.join(" AND ");
  query += ` ORDER BY sent DESC NULLS LAST, id DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  if (offset) {
    query += ` OFFSET $${params.length + 1}`;
    params.push(offset);
  }

  const pool = getPool();
  const { rows } = await pool.query(query, params);

  return rows as unknown as MessageMe[];
}
