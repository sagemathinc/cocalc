/*
Set the note field of a voucher code.

This can only be done by user who created the voucher (or admin).
The idea is that if somebody creates vouchers and wants to manage
them inside of cocalc (rather than in an external spreadsheet),
then they may want to leave a note for each voucher code when
they give it to somebody.

This could have also been implemented via db-schema, but it's a bit
complicated since access depends on both the vouchers table and the
voucher_codes tables.
*/

import getPool from "@cocalc/database/pool";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

interface Options {
  account_id: string;
  code: string; // the voucher code
  notes: string; // new value of the note field
}

export default async function setVoucherCodeNote({
  account_id,
  code,
  notes,
}: Options): Promise<void> {
  const pool = getPool();

  // We use an inner join to get the id of the voucher that has
  // the corresponding voucher code.  This isn't too complicated
  // and is better than making two queries.
  const { rows } = await pool.query(
    "SELECT vouchers.created_by as created_by FROM vouchers INNER JOIN voucher_codes ON vouchers.id=voucher_codes.id WHERE voucher_codes.code=$1",
    [code]
  );
  if (rows.length == 0) {
    throw Error(`no voucher code "${code}"`);
  }
  const { created_by } = rows[0];
  if (created_by != account_id && !(await userIsInGroup(account_id, "admin"))) {
    throw Error(
      "only the user that created a voucher can edit the notes field"
    );
  }

  // OK, good to go regarding permissions.
  await pool.query("UPDATE voucher_codes SET notes=$1 WHERE code=$2", [
    notes,
    code,
  ]);
}
