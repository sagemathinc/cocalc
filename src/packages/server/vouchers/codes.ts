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
  license_ids,
}: {
  code: string;
  account_id: string;
  license_ids: string[];
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE voucher_codes SET when_redeemed=$1, redeemed_by=$2, license_ids=$3 WHERE code=$4",
    [new Date(), account_id, license_ids, code]
  );
  for (const license_id of license_ids) {
    await pool.query("UPDATE site_licenses SET voucher_code=$1 WHERE id=$2", [
      code,
      license_id,
    ]);
  }
}
