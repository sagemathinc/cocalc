import type { VoucherCode } from "@cocalc/util/db-schema/vouchers";
import getPool from "@cocalc/database/pool";

// throws an error if the code doesn't exist
export async function getVoucherCode(code: string): Promise<VoucherCode> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM voucher_codes WHERE code=$1",
    [code]
  );
  if (rows.length == 0) {
    throw Error(`There is no voucher '${code}'.`);
  }
  return rows[0] as VoucherCode;
}

export async function redeemVoucherCode({
  code,
  account_id,
}: {
  code: string;
  account_id: string;
}) {
  const pool = getPool();
  await pool.query(
    "UPDATE voucher_codes SET when_redeemed=$1, redeemed_by=$2 WHERE code=$3",
    [new Date(), account_id, code]
  );
}
