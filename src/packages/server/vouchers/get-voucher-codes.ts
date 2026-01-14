/*
Get all voucher codes with a given id, assuming appropriate permissions.

This could also be done via db-schema, but it's a single use case and
changefeeds aren't important for this, so let's go with this.
*/

import getPool from "@cocalc/database/pool";
import type { VoucherCode } from "@cocalc/util/db-schema/vouchers";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

interface Options {
  account_id: string;
  id: string; // id of the voucher (so id columns of vouchers table)
}

export default async function getVoucherCodes({
  account_id,
  id,
}: Options): Promise<VoucherCode[]> {
  const pool = getPool();

  const { rows } = await pool.query(
    "SELECT created_by FROM vouchers WHERE id=$1",
    [id]
  );
  if (rows.length == 0) {
    throw Error(`no voucher with id ${id}`);
  }
  if (rows[0].created_by != account_id) {
    if (!(await userIsInGroup(account_id, "admin"))) {
      throw Error("user must be the creator of the voucher or an admin");
    }
  }
  // OK, good to go regarding permissions.

  const { rows: rows2 } = await pool.query(
    "SELECT code, created, when_redeemed, redeemed_by, notes, canceled FROM voucher_codes WHERE id=$1 ORDER BY created DESC, code",
    [id]
  );
  return rows2;
}
