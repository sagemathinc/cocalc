import type { Voucher } from "@cocalc/util/db-schema/vouchers";
import getPool from "@cocalc/database/pool";

// throws an error if the voucher doesn't exist
export async function getVoucher(id: number): Promise<Voucher> {
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM vouchers WHERE id=$1", [id]);
  if (rows.length == 0) {
    throw Error(`no voucher ${id}`);
  }
  return rows[0] as Voucher;
}
