import type { VoucherCode } from "@cocalc/util/db-schema/vouchers";
import getPool, { PoolClient } from "@cocalc/database/pool";

// throws an error if the code doesn't exist
export async function getVoucherCode(code: string): Promise<VoucherCode> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM voucher_codes WHERE code=$1",
    [code],
  );
  if (rows.length == 0) {
    throw Error(`There is no voucher '${code}'.`);
  }
  return rows[0] as VoucherCode;
}

export async function redeemVoucherCode({
  code,
  account_id,
  purchase_ids,
  client,
}: {
  code: string;
  account_id: string;
  purchase_ids: number[];
  client: PoolClient;
}): Promise<void> {
  await client.query(
    "UPDATE voucher_codes SET when_redeemed=$1, redeemed_by=$2, purchase_ids=$3 WHERE code=$4",
    [new Date(), account_id, purchase_ids, code],
  );
}
