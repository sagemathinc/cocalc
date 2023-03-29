/*
Get vouchers that you recently purchased.
*/

import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import type { Voucher } from "@cocalc/util/db-schema/vouchers";

interface Options {
  account_id: string;
  recent?: string; // specify how recent.  Default is "1 week".
}

export default async function getRecentlyCreatedVouchers({
  account_id,
  recent,
}: Options): Promise<Voucher[]> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is invalid");
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, title, count, created FROM vouchers WHERE created_by=$1 AND created >= NOW()- $2::interval ORDER BY created DESC`,
    [account_id, recent ?? "1 week"]
  );
  return rows;
}
