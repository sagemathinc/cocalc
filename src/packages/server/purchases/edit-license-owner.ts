/*

An aspect of editing a license is setting the owner of the license. This is the
unique cocalc account that is allowed to edit the license. Only admins can
change this right now.

NOTE that a sort of stupid thing is the owner is by definition in the purchase
info field, so changing that is a little weird.
*/

import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";

interface Options {
  account_id: string;
  license_id: string;
  new_account_id: string;
}

export default async function adminSetLicenseOwner({
  account_id,
  license_id,
  new_account_id,
}: Options) {
  if (!(await userIsInGroup(account_id, "admin"))) {
    throw Error("only admins can edit the owner of a license");
  }
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  if (!isValidUUID(license_id)) {
    throw Error("license_id must be a valid uuid");
  }
  if (!isValidUUID(new_account_id)) {
    throw Error("new_account_id must be a valid uuid");
  }

  const pool = getPool();
  // We just read then write it back, since (1) it's easier to get it to work
  // in all possible cases than using jsonb, and (2) this is VERY rare so there's
  // no worries about race conditions.
  const { rows } = await pool.query(
    "SELECT info FROM site_licenses WHERE id=$1",
    [license_id],
  );
  if (rows.length == 0) {
    throw Error("no such license");
  }
  const info = { ...rows[0]?.info };
  if (info.purchased == null) {
    info.purchased = {};
  }
  info.purchased.account_id = new_account_id;
  await pool.query("UPDATE site_licenses SET info=$1 WHERE id=$2", [
    info,
    license_id,
  ]);
}
